import type { SqlExecutor } from "../sqlExecutor.js";
import type { Database } from "../../supabase/types.js";
import { type RawRow, type RepoError } from "./shared.js";

type PersonalRecordRow = Database["public"]["Tables"]["personal_records"]["Row"];

/**
 * CTE compartida por `getPersonalRecords`/`getAllPersonalRecords`: para cada
 * `(exercise_id, reps)` no borrado, elige una única fila canónica (mayor
 * peso; empate por `achieved_at` más antiguo, y por `id` como último
 * desempate para que el resultado sea determinista) vía `ROW_NUMBER()`.
 * Colapsa así el duplicado aceptado de `personal_records` (ver doc de
 * `getPersonalRecords`) sin tocar las filas ni el mecanismo que las genera.
 */
const DEDUP_PERSONAL_RECORDS_CTE = `
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY exercise_id, reps
      ORDER BY weight DESC, achieved_at ASC, id ASC
    ) AS rn
    FROM personal_records
    WHERE _deleted = 0
  ), best AS (
    SELECT id FROM ranked WHERE rn = 1
  )
`;

function mapPersonalRecordRow(row: RawRow): PersonalRecordRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    exercise_id: row.exercise_id as string,
    weight: row.weight as number,
    reps: row.reps as number,
    achieved_at: row.achieved_at as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Repositorio local de lectura de personal_records — espeja
 * createProgressRepository().getPersonalRecords/getAllPersonalRecords/
 * getWeeklyTraining/getBestSetsByExercise (packages/database/src/repositories/
 * progressRepository.ts): son consultas simples sobre tablas ya replicadas
 * localmente (sets/workout_exercises/workouts/personal_records), sin
 * agregados propios de Postgres. Las filas de personal_records se escriben
 * desde localWorkoutRepository.updateSet (ver maybeRecordPersonalRecord),
 * réplica del trigger SQL. El resto de progressRepository (getExerciseStats,
 * getExerciseHistory, getRoutineStats, getChartData, convertExerciseWeights)
 * se queda remote-only — analíticas fuera de alcance offline (ver offline-sync.md).
 */
export function createLocalProgressRepository(db: SqlExecutor) {
  return {
    /**
     * Lee de `personal_records` (solo lectura, sin cascada ni pending_ops) los
     * PRs de un ejercicio, un peor-a-mejor por número de reps — colapsando a
     * una única fila por `reps` (ver {@link DEDUP_PERSONAL_RECORDS_CTE}): el
     * mismo set completado offline puede generar dos filas para el mismo PR
     * (una vía `maybeRecordPersonalRecord` local, otra vía el trigger SQL
     * remoto al pushear el set, ver `offline-sync.md`); ambas quedan en la
     * tabla (esto no las borra), pero solo una llega a la UI.
     */
    async getPersonalRecords(exerciseId: string): Promise<{ data: PersonalRecordRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `${DEDUP_PERSONAL_RECORDS_CTE}
         SELECT pr.* FROM personal_records pr
         JOIN best ON best.id = pr.id
         WHERE pr.exercise_id = ?
         ORDER BY pr.reps ASC, pr.weight DESC`,
        [exerciseId]
      );
      return { data: rows.map(mapPersonalRecordRow), error: null };
    },

    /** Lee todos los PRs del usuario activo, usado por el badge de PR y el tab Progreso — mismo dedup que {@link getPersonalRecords}. */
    async getAllPersonalRecords(): Promise<{ data: PersonalRecordRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `${DEDUP_PERSONAL_RECORDS_CTE}
         SELECT pr.* FROM personal_records pr
         JOIN best ON best.id = pr.id
         ORDER BY pr.exercise_id ASC, pr.reps ASC, pr.weight DESC`,
        []
      );
      return { data: rows.map(mapPersonalRecordRow), error: null };
    },

    /**
     * Agrega, por ejercicio, el número de sets completos y el volumen total
     * (peso×reps) desde `weekStart` — join manual sets→workout_exercises→workouts
     * en JS, ya que SQLite local no tiene las funciones de agregación de Postgres.
     */
    async getWeeklyTraining(weekStart: string): Promise<{ exerciseId: string; setCount: number; volume: number }[]> {
      const rows = await db.getAllAsync<{ exercise_id: string; weight: number | null; reps: number | null }>(
        `SELECT we.exercise_id as exercise_id, s.weight as weight, s.reps as reps
         FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id AND we._deleted = 0
         JOIN workouts w ON w.id = we.workout_id AND w._deleted = 0
         WHERE s._deleted = 0 AND s.is_complete = 1 AND s.is_warmup = 0 AND w.date >= ?`,
        [weekStart]
      );
      const byExercise: Record<string, { setCount: number; volume: number }> = {};
      for (const row of rows) {
        if (!byExercise[row.exercise_id]) byExercise[row.exercise_id] = { setCount: 0, volume: 0 };
        byExercise[row.exercise_id]!.setCount++;
        byExercise[row.exercise_id]!.volume += (row.weight ?? 0) * (row.reps ?? 0);
      }
      return Object.entries(byExercise).map(([exerciseId, vals]) => ({ exerciseId, ...vals }));
    },

    /** Devuelve, por cada ejercicio de `exerciseIds`, el máximo de reps/distancia/tiempo entre sus sets completos no-warmup — usado para calculadoras/récords por tipo de ejercicio avanzado. */
    async getBestSetsByExercise(
      exerciseIds: string[]
    ): Promise<Record<string, { maxReps: number; maxDistance: number; maxTime: number }>> {
      if (exerciseIds.length === 0) return {};
      const placeholders = exerciseIds.map(() => "?").join(",");
      const rows = await db.getAllAsync<{
        exercise_id: string;
        reps: number | null;
        distance: number | null;
        time_seconds: number | null;
      }>(
        `SELECT we.exercise_id as exercise_id, s.reps as reps, s.distance as distance, s.time_seconds as time_seconds
         FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id AND we._deleted = 0
         WHERE s._deleted = 0 AND s.is_complete = 1 AND s.is_warmup = 0 AND we.exercise_id IN (${placeholders})`,
        exerciseIds
      );
      const result: Record<string, { maxReps: number; maxDistance: number; maxTime: number }> = {};
      for (const row of rows) {
        if (!result[row.exercise_id]) result[row.exercise_id] = { maxReps: 0, maxDistance: 0, maxTime: 0 };
        if ((row.reps ?? 0) > result[row.exercise_id]!.maxReps) result[row.exercise_id]!.maxReps = row.reps ?? 0;
        if ((row.distance ?? 0) > result[row.exercise_id]!.maxDistance) result[row.exercise_id]!.maxDistance = row.distance ?? 0;
        if ((row.time_seconds ?? 0) > result[row.exercise_id]!.maxTime) result[row.exercise_id]!.maxTime = row.time_seconds ?? 0;
      }
      return result;
    },
  };
}

/** Tipo del repositorio devuelto por {@link createLocalProgressRepository}. */
export type LocalProgressRepository = ReturnType<typeof createLocalProgressRepository>;
