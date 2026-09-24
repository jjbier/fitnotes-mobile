import { calculate1RM } from "@fitnotes/core";
import type { SqlExecutor } from "../sqlExecutor.js";
import type { Database } from "../../supabase/types.js";
import type { ChartPoint } from "../../repositories/progressRepository.js";
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
 * getWeeklyTraining/getDailyTraining/getBestSetsByExercise (packages/database/src/repositories/
 * progressRepository.ts): son consultas simples sobre tablas ya replicadas
 * localmente (sets/workout_exercises/workouts/personal_records), sin
 * agregados propios de Postgres. Las filas de personal_records se escriben
 * desde localWorkoutRepository.updateSet (ver maybeRecordPersonalRecord),
 * réplica del trigger SQL. También espeja `getChartData` (para que la
 * pantalla de historial del ejercicio funcione sin cuenta, ver CLAUDE.md).
 * El resto de progressRepository (getExerciseStats, getExerciseHistory —ver
 * localExerciseRepository—, getRoutineStats, convertExerciseWeights)
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
     * (peso×reps) entre `dateFrom` y `dateTo` (ambos inclusive; `dateTo`
     * omitido = sin límite superior) — join manual sets→workout_exercises→workouts
     * en JS, ya que SQLite local no tiene las funciones de agregación de Postgres.
     * Usado para el resumen por categoría del tab Progreso, con el rango que
     * corresponda al periodo elegido (semana/mes/año/todo).
     */
    async getWeeklyTraining(dateFrom: string, dateTo?: string): Promise<{ exerciseId: string; setCount: number; volume: number }[]> {
      const rows = await db.getAllAsync<{ exercise_id: string; weight: number | null; reps: number | null }>(
        `SELECT we.exercise_id as exercise_id, s.weight as weight, s.reps as reps
         FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id AND we._deleted = 0
         JOIN workouts w ON w.id = we.workout_id AND w._deleted = 0
         WHERE s._deleted = 0 AND s.is_complete = 1 AND s.is_warmup = 0 AND w.date >= ?${dateTo ? " AND w.date <= ?" : ""}`,
        dateTo ? [dateFrom, dateTo] : [dateFrom]
      );
      const byExercise: Record<string, { setCount: number; volume: number }> = {};
      for (const row of rows) {
        if (!byExercise[row.exercise_id]) byExercise[row.exercise_id] = { setCount: 0, volume: 0 };
        byExercise[row.exercise_id]!.setCount++;
        byExercise[row.exercise_id]!.volume += (row.weight ?? 0) * (row.reps ?? 0);
      }
      return Object.entries(byExercise).map(([exerciseId, vals]) => ({ exerciseId, ...vals }));
    },

    /**
     * Agrega, por fecha de entrenamiento (no por ejercicio), el número de sets
     * completos y el volumen total desde `dateFrom` en adelante, a través de
     * TODOS los ejercicios — usado por el tab Progreso para la racha de días
     * consecutivos, las cifras de cabecera del periodo elegido y el gráfico de
     * tendencia de volumen semanal (todo derivado de esta única serie diaria).
     */
    async getDailyTraining(dateFrom: string): Promise<{ date: string; setCount: number; volume: number }[]> {
      const rows = await db.getAllAsync<{ date: string; weight: number | null; reps: number | null }>(
        `SELECT w.date as date, s.weight as weight, s.reps as reps
         FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id AND we._deleted = 0
         JOIN workouts w ON w.id = we.workout_id AND w._deleted = 0
         WHERE s._deleted = 0 AND s.is_complete = 1 AND s.is_warmup = 0 AND w.date >= ?`,
        [dateFrom]
      );
      const byDate: Record<string, { setCount: number; volume: number }> = {};
      for (const row of rows) {
        if (!byDate[row.date]) byDate[row.date] = { setCount: 0, volume: 0 };
        byDate[row.date]!.setCount++;
        byDate[row.date]!.volume += (row.weight ?? 0) * (row.reps ?? 0);
      }
      return Object.entries(byDate)
        .map(([date, vals]) => ({ date, ...vals }))
        .sort((a, b) => a.date.localeCompare(b.date));
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

    /**
     * Serie temporal de {@link ChartPoint} para un ejercicio, leída de las
     * tablas locales — espeja `getChartData()` remoto método a método (mismas
     * fórmulas: 1RM estimado vía {@link calculate1RM}, velocidad/ritmo para
     * ejercicios de distancia+tiempo, mejor peso por número de reps),
     * agregando en JS por fecha de entrenamiento ya que SQLite local no tiene
     * los agregados de Postgres. Ordenado por fecha ascendente.
     */
    async getChartData(exerciseId: string): Promise<ChartPoint[]> {
      const weRows = await db.getAllAsync<{ we_id: string; date: string }>(
        `SELECT we.id as we_id, w.date as date
         FROM workout_exercises we
         JOIN workouts w ON w.id = we.workout_id AND w._deleted = 0
         WHERE we.exercise_id = ? AND we._deleted = 0`,
        [exerciseId]
      );
      if (weRows.length === 0) return [];

      const dateByWeId: Record<string, string> = {};
      for (const we of weRows) dateByWeId[we.we_id] = we.date;

      const weIds = weRows.map((we) => we.we_id);
      const placeholders = weIds.map(() => "?").join(",");
      const setRows = await db.getAllAsync<{
        workout_exercise_id: string;
        weight: number | null;
        reps: number | null;
        distance: number | null;
        time_seconds: number | null;
      }>(
        `SELECT workout_exercise_id, weight, reps, distance, time_seconds
         FROM sets
         WHERE _deleted = 0 AND is_complete = 1 AND is_warmup = 0 AND workout_exercise_id IN (${placeholders})`,
        weIds
      );
      if (setRows.length === 0) return [];

      type DateAgg = Omit<ChartPoint, "date">;
      const byDate: Record<string, DateAgg> = {};

      for (const s of setRows) {
        const date = dateByWeId[s.workout_exercise_id];
        if (!date) continue;
        const w = s.weight ?? 0;
        const r = s.reps ?? 0;
        const dist = s.distance ?? 0;
        const time = s.time_seconds ?? 0;
        if (!byDate[date]) {
          byDate[date] = {
            maxWeight: 0, totalVolume: 0, maxReps: 0, totalReps: 0, est1RM: 0,
            maxDistance: 0, maxTime: 0, totalDistance: 0, totalTime: 0,
            maxSpeed: 0, bestPace: 0, weightByReps: {},
          };
        }
        const entry = byDate[date]!;
        if (w > entry.maxWeight) entry.maxWeight = w;
        entry.totalVolume += w * r;
        if (r > entry.maxReps) entry.maxReps = r;
        entry.totalReps += r;
        entry.totalDistance += dist;
        entry.totalTime += time;
        if (dist > entry.maxDistance) entry.maxDistance = dist;
        if (time > entry.maxTime) entry.maxTime = time;
        if (w > 0 && r > 0 && r < 37) {
          const orm = calculate1RM(w, r);
          if (orm > entry.est1RM) entry.est1RM = orm;
          if (entry.weightByReps[r] == null || w > entry.weightByReps[r]!) {
            entry.weightByReps[r] = w;
          }
        }
        if (dist > 0 && time > 0) {
          const speed = (dist / time) * 3600;
          if (speed > entry.maxSpeed) entry.maxSpeed = speed;
          const pace = time / dist;
          if (entry.bestPace === 0 || pace < entry.bestPace) entry.bestPace = pace;
        }
      }

      return Object.entries(byDate)
        .map(([date, vals]) => ({ date, ...vals }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

/** Tipo del repositorio devuelto por {@link createLocalProgressRepository}. */
export type LocalProgressRepository = ReturnType<typeof createLocalProgressRepository>;
