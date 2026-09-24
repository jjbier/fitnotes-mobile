import { generateUUID, computePersonalRecordUpdate, recomputePersonalRecordLedger } from "@fitnotes/core";
import type { SqlExecutor } from "../sqlExecutor.js";
import { enqueuePendingOp } from "../pendingOps.js";
import type { Database } from "../../supabase/types.js";
import { nowIso, toBool, fromBool, type RawRow, type RepoError } from "./shared.js";

type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];
type WorkoutExerciseRow = Database["public"]["Tables"]["workout_exercises"]["Row"];
type SetRow = Database["public"]["Tables"]["sets"]["Row"];
type PersonalRecordRow = Database["public"]["Tables"]["personal_records"]["Row"];
type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

/**
 * Genera los PRs localmente (ver packages/core/src/utils/personalRecords.ts)
 * — corre dentro de la misma transacción que el UPDATE del set para que un
 * workout de invitado también genere sus PRs sin depender de sync. Solo
 * INSERT (nunca overwrite): un `(exercise_id, reps)` puede acumular varias
 * filas de histórico, la más reciente con mayor peso es "la" PR vigente.
 *
 * Hasta la migración `010_drop_personal_record_trigger.sql` (2026-09-24)
 * existía también un trigger SQL remoto (`update_personal_record`,
 * `AFTER INSERT/UPDATE ON sets`) que hacía este mismo cálculo de forma
 * independiente al pushear el set — como el orden de push empuja `sets`
 * antes que `personal_records` (`pushOrdering.ts`), el trigger nunca veía
 * todavía la fila generada aquí y duplicaba el PR en Supabase. No solo tras
 * claim+sync: pasaba en cualquier sync de cualquier PR completado
 * offline-first, para cualquier cuenta. El trigger era puramente redundante
 * (ninguna app aparte de este móvil escribe `sets` en Supabase), así que se
 * quitó en vez de coordinar los dos escritores. Las filas duplicadas
 * generadas antes de esa migración siguen en la tabla — se colapsan en la
 * lectura vía la CTE de `ROW_NUMBER()` en `getPersonalRecords`/
 * `getAllPersonalRecords` (`localProgressRepository.ts`), que se mantiene
 * como red de seguridad para ese histórico.
 */
async function maybeRecordPersonalRecord(db: SqlExecutor, setRow: RawRow): Promise<void> {
  const isComplete = toBool(setRow.is_complete);
  const weight = (setRow.weight as number | null) ?? null;
  const reps = (setRow.reps as number | null) ?? null;
  if (!isComplete || weight == null || reps == null) return;

  const we = await db.getFirstAsync<{ exercise_id: string; user_id: string }>(
    `SELECT exercise_id, user_id FROM workout_exercises WHERE id = ?`,
    [setRow.workout_exercise_id as string]
  );
  if (!we) return;

  const current = await db.getFirstAsync<{ maxWeight: number | null }>(
    `SELECT MAX(weight) as maxWeight FROM personal_records WHERE exercise_id = ? AND user_id = ? AND reps = ? AND _deleted = 0`,
    [we.exercise_id, we.user_id, reps]
  );

  const update = computePersonalRecordUpdate({ isComplete, weight, reps }, current?.maxWeight ?? null);
  if (!update) return;

  const id = generateUUID();
  const ts = nowIso();
  const prRow: PersonalRecordRow = {
    id,
    user_id: we.user_id,
    exercise_id: we.exercise_id,
    weight: update.weight,
    reps: update.reps,
    achieved_at: ts,
    created_at: ts,
    updated_at: ts,
  };
  await db.runAsync(
    `INSERT INTO personal_records (id, user_id, exercise_id, weight, reps, achieved_at, created_at, updated_at, _dirty, _deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
    [prRow.id, prRow.user_id, prRow.exercise_id, prRow.weight, prRow.reps, prRow.achieved_at, prRow.created_at, prRow.updated_at]
  );
  await enqueuePendingOp(db, "personal_records", id, "insert", prRow);
}

/**
 * `personal_records` no referencia el set que la generó (ni aquí ni en
 * remoto) — no hay forma de saber "qué fila borrar" cuando se borra un set.
 * En su lugar, se tombstonan TODAS las filas vigentes del ejercicio y se
 * reconstruye el ledger completo desde los `sets` vivos que queden
 * (`recomputePersonalRecordLedger`, misma regla que `maybeRecordPersonalRecord`
 * pero en bloque). Debe llamarse dentro de la misma transacción que borra el
 * set/workout, después de tombstonar `sets`/`workout_exercises`.
 */
async function resyncPersonalRecordsForExercise(db: SqlExecutor, exerciseId: string, userId: string): Promise<void> {
  const ts = nowIso();
  const existing = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM personal_records WHERE exercise_id = ? AND user_id = ? AND _deleted = 0`,
    [exerciseId, userId]
  );
  for (const pr of existing) {
    await db.runAsync(`UPDATE personal_records SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, pr.id]);
    await enqueuePendingOp(db, "personal_records", pr.id, "delete", null);
  }

  const liveSets = await db.getAllAsync<{ weight: number; reps: number; created_at: string }>(
    `SELECT s.weight as weight, s.reps as reps, s.created_at as created_at
     FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
     WHERE we.exercise_id = ? AND we.user_id = ? AND we._deleted = 0 AND s._deleted = 0
       AND s.is_complete = 1 AND s.weight IS NOT NULL AND s.reps IS NOT NULL`,
    [exerciseId, userId]
  );
  const ledger = recomputePersonalRecordLedger(
    liveSets.map((s) => ({ exercise_id: exerciseId, reps: s.reps, weight: s.weight, created_at: s.created_at }))
  );
  for (const entry of ledger) {
    const id = generateUUID();
    const prRow: PersonalRecordRow = {
      id, user_id: userId, exercise_id: entry.exercise_id,
      weight: entry.weight, reps: entry.reps, achieved_at: entry.achieved_at, created_at: ts, updated_at: ts,
    };
    await db.runAsync(
      `INSERT INTO personal_records (id, user_id, exercise_id, weight, reps, achieved_at, created_at, updated_at, _dirty, _deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [prRow.id, prRow.user_id, prRow.exercise_id, prRow.weight, prRow.reps, prRow.achieved_at, prRow.created_at, prRow.updated_at]
    );
    await enqueuePendingOp(db, "personal_records", id, "insert", prRow);
  }
}

/** Pares (ejercicio, usuario) distintos entre los `sets` dados que podrían haber generado un PR (completos, con peso y reps). */
async function distinctPRExercises(db: SqlExecutor, setIds: string[]): Promise<{ exercise_id: string; user_id: string }[]> {
  if (setIds.length === 0) return [];
  const placeholders = setIds.map(() => "?").join(",");
  return db.getAllAsync<{ exercise_id: string; user_id: string }>(
    `SELECT DISTINCT we.exercise_id as exercise_id, we.user_id as user_id
     FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
     WHERE s.id IN (${placeholders}) AND s.is_complete = 1 AND s.weight IS NOT NULL AND s.reps IS NOT NULL`,
    setIds
  );
}

function mapWorkoutRow(row: RawRow): WorkoutRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    date: row.date as string,
    comment: (row.comment as string | null) ?? null,
    start_time: (row.start_time as string | null) ?? null,
    end_time: (row.end_time as string | null) ?? null,
    duration_minutes: (row.duration_minutes as number | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapWorkoutExerciseRow(row: RawRow): WorkoutExerciseRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    workout_id: row.workout_id as string,
    exercise_id: row.exercise_id as string,
    order_index: row.order_index as number,
    group_id: (row.group_id as string | null) ?? null,
    group_name: (row.group_name as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapSetRow(row: RawRow): SetRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    workout_exercise_id: row.workout_exercise_id as string,
    order_index: row.order_index as number,
    weight: (row.weight as number | null) ?? null,
    reps: (row.reps as number | null) ?? null,
    distance: (row.distance as number | null) ?? null,
    time_seconds: (row.time_seconds as number | null) ?? null,
    is_complete: toBool(row.is_complete),
    is_warmup: toBool(row.is_warmup),
    comment: (row.comment as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Repositorio local de entrenamientos — espeja createWorkoutRepository()
 * (packages/database/src/repositories/workoutRepository.ts) método a método,
 * mismo shape de retorno { data, error }. Toda escritura: genera UUID si es
 * insert, escribe en local marcando _dirty=1, encola en pending_ops (misma
 * transacción) y devuelve el mismo shape que el repo de Supabase. Los borrados
 * marcan _deleted=1 (tombstone) en vez de borrar físicamente.
 *
 * `importFromCSV`/`exportAllCSV` (2026-09-22) también tienen réplica local,
 * mismo formato exacto que el remoto. `shareWorkout`/`deleteWorkoutHistory`
 * siguen fuera — la primera ni siquiera existe como método de repo, la
 * segunda sigue requiriendo cuenta real (ver plan, "fuera de alcance").
 */
export function createLocalWorkoutRepository(db: SqlExecutor) {
  return {
    // ─── Workouts ──────────────────────────────────────────────────────────────

    /** Busca un `workouts` vivo por id. Solo lectura. */
    async getWorkout(id: string): Promise<{ data: WorkoutRow | null; error: RepoError | null }> {
      const row = await db.getFirstAsync<RawRow>(
        `SELECT * FROM workouts WHERE id = ? AND _deleted = 0`,
        [id]
      );
      return { data: row ? mapWorkoutRow(row) : null, error: null };
    },

    /** Busca el `workouts` vivo de una fecha exacta (el más antiguo si hubiera varios). Solo lectura. */
    async getWorkoutByDate(date: string): Promise<{ data: WorkoutRow | null; error: RepoError | null }> {
      const row = await db.getFirstAsync<RawRow>(
        `SELECT * FROM workouts WHERE date = ? AND _deleted = 0 ORDER BY created_at ASC LIMIT 1`,
        [date]
      );
      return { data: row ? mapWorkoutRow(row) : null, error: null };
    },

    /**
     * Todos los `workouts` vivos de una fecha exacta (0, 1 o varios —
     * soporte para varios entrenamientos el mismo día, ver
     * docs/implementation-plan-multi-workout-per-day.md). Orden: por
     * `start_time` ascendente (los que no tienen hora, al final), y entre
     * empates o sin hora, por `created_at` ascendente. Solo lectura.
     */
    async getWorkoutsByDate(date: string): Promise<{ data: WorkoutRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM workouts WHERE date = ? AND _deleted = 0
         ORDER BY (start_time IS NULL), start_time ASC, created_at ASC`,
        [date]
      );
      return { data: rows.map(mapWorkoutRow), error: null };
    },

    /** Lee los últimos `limit` `workouts` vivos, más reciente primero. Solo lectura. */
    async getWorkouts(limit = 30): Promise<{ data: WorkoutRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM workouts WHERE _deleted = 0 ORDER BY date DESC LIMIT ?`,
        [limit]
      );
      return { data: rows.map(mapWorkoutRow), error: null };
    },

    /**
     * Lee los últimos `limit` entrenamientos con número de ejercicios y
     * volumen (peso×reps de sets completos no-warmup) agregados en JS —
     * espeja el resumen que en remoto haría una vista/RPC de Postgres, aquí
     * como varios joins manuales sobre las tablas locales. Solo lectura.
     */
    async getWorkoutsWithSummary(limit = 10): Promise<{
      data: { id: string; date: string; exerciseCount: number; volume: number }[];
    }> {
      const workouts = await db.getAllAsync<{ id: string; date: string }>(
        `SELECT id, date FROM workouts WHERE _deleted = 0 ORDER BY date DESC LIMIT ?`,
        [limit]
      );
      if (workouts.length === 0) return { data: [] };
      const ids = workouts.map((w) => w.id);
      const placeholders = ids.map(() => "?").join(",");

      const wes = await db.getAllAsync<{ id: string; workout_id: string }>(
        `SELECT id, workout_id FROM workout_exercises WHERE _deleted = 0 AND workout_id IN (${placeholders})`,
        ids
      );
      const exerciseCount: Record<string, number> = {};
      const weToWorkout = new Map<string, string>();
      for (const we of wes) {
        exerciseCount[we.workout_id] = (exerciseCount[we.workout_id] ?? 0) + 1;
        weToWorkout.set(we.id, we.workout_id);
      }

      const weIds = [...weToWorkout.keys()];
      const volumeByWorkout: Record<string, number> = {};
      if (weIds.length > 0) {
        const wePlaceholders = weIds.map(() => "?").join(",");
        const sets = await db.getAllAsync<{ workout_exercise_id: string; weight: number | null; reps: number | null }>(
          `SELECT workout_exercise_id, weight, reps FROM sets
           WHERE _deleted = 0 AND is_complete = 1 AND is_warmup = 0 AND workout_exercise_id IN (${wePlaceholders})`,
          weIds
        );
        for (const s of sets) {
          const wId = weToWorkout.get(s.workout_exercise_id);
          if (!wId || !s.weight || !s.reps) continue;
          volumeByWorkout[wId] = (volumeByWorkout[wId] ?? 0) + s.weight * s.reps;
        }
      }

      return {
        data: workouts.map((w) => ({
          id: w.id,
          date: w.date,
          exerciseCount: exerciseCount[w.id] ?? 0,
          volume: volumeByWorkout[w.id] ?? 0,
        })),
      };
    },

    /** Inserta un nuevo entrenamiento en `workouts` con UUID de cliente y encola el insert. */
    async createWorkout(
      data: { date: string; start_time?: string; comment?: string },
      userId: string
    ): Promise<{ data: WorkoutRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: WorkoutRow = {
        id,
        user_id: userId,
        date: data.date,
        comment: data.comment ?? null,
        start_time: data.start_time ?? null,
        end_time: null,
        duration_minutes: null,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO workouts (id, user_id, date, comment, start_time, end_time, duration_minutes, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [row.id, row.user_id, row.date, row.comment, row.start_time, row.end_time, row.duration_minutes, row.created_at, row.updated_at]
        );
        await enqueuePendingOp(db, "workouts", id, "insert", row);
      });
      return { data: row, error: null };
    },

    /** Actualiza campos parciales de un entrenamiento (fecha, horas, duración, comentario) y encola el update. */
    async updateWorkout(
      id: string,
      data: { date?: string; start_time?: string; end_time?: string; duration_minutes?: number; comment?: string }
    ): Promise<{ data: WorkoutRow | null; error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        const sets: string[] = [];
        const params: unknown[] = [];
        for (const [key, value] of Object.entries(data)) {
          sets.push(`${key} = ?`);
          params.push(value);
        }
        sets.push("updated_at = ?", "_dirty = 1");
        params.push(ts);
        params.push(id);
        await db.runAsync(`UPDATE workouts SET ${sets.join(", ")} WHERE id = ?`, params);
        await enqueuePendingOp(db, "workouts", id, "update", { ...data, updated_at: ts });
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM workouts WHERE id = ?`, [id]);
      return { data: row ? mapWorkoutRow(row) : null, error: null };
    },

    /**
     * Tombstonea un entrenamiento y cascada manual sobre sus
     * `workout_exercises` y los `sets` de cada uno — espeja el
     * `ON DELETE CASCADE` remoto. Un `pending_op` de delete por fila afectada.
     */
    async deleteWorkout(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const wes = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM workout_exercises WHERE workout_id = ? AND _deleted = 0`,
          [id]
        );
        const allSetIds: string[] = [];
        for (const we of wes) {
          const setRows = await db.getAllAsync<{ id: string }>(`SELECT id FROM sets WHERE workout_exercise_id = ?`, [we.id]);
          allSetIds.push(...setRows.map((s) => s.id));
          await db.runAsync(`UPDATE sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE workout_exercise_id = ?`, [
            nowIso(),
            we.id,
          ]);
          for (const s of setRows) await enqueuePendingOp(db, "sets", s.id, "delete", null);
          await db.runAsync(`UPDATE workout_exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [
            nowIso(),
            we.id,
          ]);
          await enqueuePendingOp(db, "workout_exercises", we.id, "delete", null);
        }
        const affected = await distinctPRExercises(db, allSetIds);
        for (const a of affected) await resyncPersonalRecordsForExercise(db, a.exercise_id, a.user_id);
        await db.runAsync(`UPDATE workouts SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [nowIso(), id]);
        await enqueuePendingOp(db, "workouts", id, "delete", null);
      });
      return { error: null };
    },

    // ─── Workout Exercises ─────────────────────────────────────────────────────

    /** Lee los `workout_exercises` vivos de un entrenamiento, ordenados por `order_index`. Solo lectura. */
    async getWorkoutExercises(workoutId: string): Promise<{ data: WorkoutExerciseRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM workout_exercises WHERE workout_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
        [workoutId]
      );
      return { data: rows.map(mapWorkoutExerciseRow), error: null };
    },

    /** Añade un ejercicio a un entrenamiento en `workout_exercises` con UUID de cliente y encola el insert. */
    async addExercise(
      data: { workout_id: string; exercise_id: string; order_index: number; group_id?: string; group_name?: string },
      userId: string
    ): Promise<{ data: WorkoutExerciseRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: WorkoutExerciseRow = {
        id,
        user_id: userId,
        workout_id: data.workout_id,
        exercise_id: data.exercise_id,
        order_index: data.order_index,
        group_id: data.group_id ?? null,
        group_name: data.group_name ?? null,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO workout_exercises (id, user_id, workout_id, exercise_id, order_index, group_id, group_name, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [row.id, row.user_id, row.workout_id, row.exercise_id, row.order_index, row.group_id, row.group_name, row.created_at, row.updated_at]
        );
        await enqueuePendingOp(db, "workout_exercises", id, "insert", row);
      });
      return { data: row, error: null };
    },

    /**
     * Tombstonea un `workout_exercises` y cascada manual sobre sus `sets` —
     * espeja el `ON DELETE CASCADE` remoto. Un `pending_op` de delete por set
     * más el del propio ejercicio de entrenamiento.
     */
    async removeExercise(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const ts = nowIso();
        const setRows = await db.getAllAsync<{ id: string }>(`SELECT id FROM sets WHERE workout_exercise_id = ?`, [id]);
        await db.runAsync(`UPDATE sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE workout_exercise_id = ?`, [ts, id]);
        for (const s of setRows) await enqueuePendingOp(db, "sets", s.id, "delete", null);
        await db.runAsync(`UPDATE workout_exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, id]);
        await enqueuePendingOp(db, "workout_exercises", id, "delete", null);
        const affected = await distinctPRExercises(db, setRows.map((s) => s.id));
        for (const a of affected) await resyncPersonalRecordsForExercise(db, a.exercise_id, a.user_id);
      });
      return { error: null };
    },

    /** Actualiza `group_id`/`group_name` (supersets) de un ejercicio de entrenamiento y encola el update. */
    async updateWorkoutExercise(
      id: string,
      patch: { group_id?: string | null; group_name?: string | null }
    ): Promise<{ error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        await db.runAsync(`UPDATE workout_exercises SET group_id = ?, group_name = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
          patch.group_id ?? null,
          patch.group_name ?? null,
          ts,
          id,
        ]);
        await enqueuePendingOp(db, "workout_exercises", id, "update", { ...patch, updated_at: ts });
      });
      return { error: null };
    },

    /** Propaga `group_name` a todos los `workout_exercises` que comparten `group_id` (superset), un `pending_op` de update por fila. */
    async updateGroupName(groupId: string, name: string): Promise<{ error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM workout_exercises WHERE group_id = ?`, [groupId]);
        for (const r of rows) {
          await db.runAsync(`UPDATE workout_exercises SET group_name = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
            name || null,
            ts,
            r.id,
          ]);
          await enqueuePendingOp(db, "workout_exercises", r.id, "update", { group_name: name || null, updated_at: ts });
        }
      });
      return { error: null };
    },

    /** Actualiza `order_index` de varios `workout_exercises`, una `pending_op` de update por fila, todo en una transacción. */
    async reorderExercises(updates: { id: string; order_index: number }[]): Promise<{ error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        for (const { id, order_index } of updates) {
          await db.runAsync(`UPDATE workout_exercises SET order_index = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
            order_index,
            ts,
            id,
          ]);
          await enqueuePendingOp(db, "workout_exercises", id, "update", { order_index, updated_at: ts });
        }
      });
      return { error: null };
    },

    /**
     * Copia los ejercicios (y sus sets, reiniciados a incompletos) de
     * `sourceWorkoutId` hacia `targetWorkoutId`, saltando los ya presentes en
     * `existingExerciseIds` — usado para "repetir entrenamiento anterior". IDs
     * nuevos generados en cliente, un `pending_op` de insert por fila nueva.
     * A diferencia del resto de métodos no devuelve `{ data, error }`: es
     * fire-and-forget desde la UI.
     */
    async copyWorkout(
      sourceWorkoutId: string,
      targetWorkoutId: string,
      userId: string,
      existingExerciseIds: string[],
      startOrderIndex: number
    ): Promise<void> {
      const sourceExercises = await db.getAllAsync<RawRow>(
        `SELECT * FROM workout_exercises WHERE workout_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
        [sourceWorkoutId]
      );
      if (sourceExercises.length === 0) return;
      const existingSet = new Set(existingExerciseIds);
      let orderIndex = startOrderIndex;

      await db.withTransactionAsync(async () => {
        for (const we of sourceExercises) {
          if (existingSet.has(we.exercise_id as string)) continue;
          const newWeId = generateUUID();
          const ts = nowIso();
          const newWe: WorkoutExerciseRow = {
            id: newWeId,
            user_id: userId,
            workout_id: targetWorkoutId,
            exercise_id: we.exercise_id as string,
            order_index: orderIndex++,
            group_id: (we.group_id as string | null) ?? null,
            group_name: (we.group_name as string | null) ?? null,
            created_at: ts,
            updated_at: ts,
          };
          await db.runAsync(
            `INSERT INTO workout_exercises (id, user_id, workout_id, exercise_id, order_index, group_id, group_name, created_at, updated_at, _dirty, _deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [newWe.id, newWe.user_id, newWe.workout_id, newWe.exercise_id, newWe.order_index, newWe.group_id, newWe.group_name, newWe.created_at, newWe.updated_at]
          );
          await enqueuePendingOp(db, "workout_exercises", newWeId, "insert", newWe);

          const sourceSets = await db.getAllAsync<RawRow>(
            `SELECT * FROM sets WHERE workout_exercise_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
            [we.id as string]
          );
          for (const s of sourceSets) {
            const newSetId = generateUUID();
            const setTs = nowIso();
            const newSet: SetRow = {
              id: newSetId,
              user_id: userId,
              workout_exercise_id: newWeId,
              order_index: s.order_index as number,
              weight: (s.weight as number | null) ?? null,
              reps: (s.reps as number | null) ?? null,
              distance: (s.distance as number | null) ?? null,
              time_seconds: (s.time_seconds as number | null) ?? null,
              is_complete: false,
              is_warmup: toBool(s.is_warmup),
              comment: null,
              created_at: setTs,
              updated_at: setTs,
            };
            await db.runAsync(
              `INSERT INTO sets (id, user_id, workout_exercise_id, order_index, weight, reps, distance, time_seconds, is_complete, is_warmup, comment, created_at, updated_at, _dirty, _deleted)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
              [newSet.id, newSet.user_id, newSet.workout_exercise_id, newSet.order_index, newSet.weight, newSet.reps, newSet.distance, newSet.time_seconds, fromBool(newSet.is_complete), fromBool(newSet.is_warmup), newSet.comment, newSet.created_at, newSet.updated_at]
            );
            await enqueuePendingOp(db, "sets", newSetId, "insert", newSet);
          }
        }
      });
    },

    /** Cambia la fecha de un entrenamiento existente en `workouts` y encola el update. */
    async moveWorkout(workoutId: string, targetDate: string): Promise<{ data: WorkoutRow | null; error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        await db.runAsync(`UPDATE workouts SET date = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [targetDate, ts, workoutId]);
        await enqueuePendingOp(db, "workouts", workoutId, "update", { date: targetDate, updated_at: ts });
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM workouts WHERE id = ?`, [workoutId]);
      return { data: row ? mapWorkoutRow(row) : null, error: null };
    },

    // ─── Sets ──────────────────────────────────────────────────────────────────

    /** Lee los `sets` vivos de un ejercicio de entrenamiento, ordenados por `order_index`. Solo lectura. */
    async getSets(workoutExerciseId: string): Promise<{ data: SetRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM sets WHERE workout_exercise_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
        [workoutExerciseId]
      );
      return { data: rows.map(mapSetRow), error: null };
    },

    /** Inserta un nuevo set (incompleto, no-warmup) en `sets` con UUID de cliente y encola el insert. No genera PR — solo `updateSet` lo hace, al completarse. */
    async createSet(
      data: {
        workout_exercise_id: string;
        order_index: number;
        weight?: number;
        reps?: number;
        distance?: number;
        time_seconds?: number;
      },
      userId: string
    ): Promise<{ data: SetRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: SetRow = {
        id,
        user_id: userId,
        workout_exercise_id: data.workout_exercise_id,
        order_index: data.order_index,
        weight: data.weight ?? null,
        reps: data.reps ?? null,
        distance: data.distance ?? null,
        time_seconds: data.time_seconds ?? null,
        is_complete: false,
        is_warmup: false,
        comment: null,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO sets (id, user_id, workout_exercise_id, order_index, weight, reps, distance, time_seconds, is_complete, is_warmup, comment, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, 1, 0)`,
          [row.id, row.user_id, row.workout_exercise_id, row.order_index, row.weight, row.reps, row.distance, row.time_seconds, row.created_at, row.updated_at]
        );
        await enqueuePendingOp(db, "sets", id, "insert", row);
      });
      return { data: row, error: null };
    },

    /**
     * Actualiza campos parciales de un set (UPDATE dinámico por claves
     * presentes) y encola el update. Tras escribir, relee la fila y llama a
     * `maybeRecordPersonalRecord` en la misma transacción — si el set queda
     * completo y supera el PR vigente para esas reps, inserta una fila nueva
     * en `personal_records` (réplica JS del trigger SQL remoto; puede duplicar
     * con el PR que genere el trigger tras el push, ver `offline-sync.md`).
     */
    async updateSet(
      id: string,
      data: {
        weight?: number;
        reps?: number;
        distance?: number;
        time_seconds?: number;
        is_complete?: boolean;
        is_warmup?: boolean;
        comment?: string;
      }
    ): Promise<{ data: SetRow | null; error: RepoError | null }> {
      const ts = nowIso();
      let row: RawRow | null = null;
      await db.withTransactionAsync(async () => {
        const cols: string[] = [];
        const params: unknown[] = [];
        for (const [key, value] of Object.entries(data)) {
          cols.push(`${key} = ?`);
          params.push(key === "is_complete" || key === "is_warmup" ? fromBool(value as boolean) : value);
        }
        cols.push("updated_at = ?", "_dirty = 1");
        params.push(ts, id);
        await db.runAsync(`UPDATE sets SET ${cols.join(", ")} WHERE id = ?`, params);
        await enqueuePendingOp(db, "sets", id, "update", { ...data, updated_at: ts });

        row = await db.getFirstAsync<RawRow>(`SELECT * FROM sets WHERE id = ?`, [id]);
        if (row) await maybeRecordPersonalRecord(db, row);
      });
      return { data: row ? mapSetRow(row) : null, error: null };
    },

    /** Tombstonea un único set, encola el delete y recalcula los PRs del ejercicio si el set borrado pudo haber generado uno. */
    async deleteSet(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        await db.runAsync(`UPDATE sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [nowIso(), id]);
        await enqueuePendingOp(db, "sets", id, "delete", null);
        const affected = await distinctPRExercises(db, [id]);
        for (const a of affected) await resyncPersonalRecordsForExercise(db, a.exercise_id, a.user_id);
      });
      return { error: null };
    },

    /** Actualiza `order_index` de varios sets, una `pending_op` de update por fila, todo en una transacción. */
    async reorderSets(updates: { id: string; order_index: number }[]): Promise<{ error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        for (const { id, order_index } of updates) {
          await db.runAsync(`UPDATE sets SET order_index = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [order_index, ts, id]);
          await enqueuePendingOp(db, "sets", id, "update", { order_index, updated_at: ts });
        }
      });
      return { error: null };
    },

    // ─── Lecturas auxiliares (dashboard, búsqueda global) ─────────────────────

    /**
     * Devuelve los sets (peso/reps/distancia/tiempo) de la sesión más
     * reciente de `exerciseId` distinta de `currentWorkoutId` — alimenta el
     * placeholder "última vez" al registrar un set nuevo. Solo lectura.
     */
    async getLastSessionSets(
      exerciseId: string,
      currentWorkoutId: string
    ): Promise<{ weight: number | null; reps: number | null; distance: number | null; time_seconds: number | null; order_index: number }[]> {
      const wes = await db.getAllAsync<{ id: string; workout_id: string }>(
        `SELECT id, workout_id FROM workout_exercises WHERE exercise_id = ? AND workout_id != ? AND _deleted = 0`,
        [exerciseId, currentWorkoutId]
      );
      if (wes.length === 0) return [];

      const workoutIds = wes.map((we) => we.workout_id);
      const placeholders = workoutIds.map(() => "?").join(",");
      const latest = await db.getFirstAsync<{ id: string; date: string }>(
        `SELECT id, date FROM workouts WHERE id IN (${placeholders}) AND _deleted = 0 ORDER BY date DESC LIMIT 1`,
        workoutIds
      );
      if (!latest) return [];

      const latestWe = wes.find((we) => we.workout_id === latest.id);
      if (!latestWe) return [];

      const sets = await db.getAllAsync<{
        weight: number | null;
        reps: number | null;
        distance: number | null;
        time_seconds: number | null;
        order_index: number;
      }>(
        `SELECT weight, reps, distance, time_seconds, order_index FROM sets
         WHERE workout_exercise_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
        [latestWe.id]
      );
      return sets;
    },

    /**
     * Para cada ejercicio en `exerciseIds`, devuelve fecha, peso/reps máximos
     * y número de sets de su sesión más reciente — usado por el dashboard y
     * la búsqueda global para mostrar el último registro sin abrir el
     * entrenamiento completo. Solo lectura.
     */
    async getLastWorkoutByExercises(
      exerciseIds: string[]
    ): Promise<Record<string, { date: string; maxWeight: number; maxReps: number; setCount: number }>> {
      if (exerciseIds.length === 0) return {};
      const placeholders = exerciseIds.map(() => "?").join(",");
      const wes = await db.getAllAsync<{ id: string; exercise_id: string; workout_id: string }>(
        `SELECT id, exercise_id, workout_id FROM workout_exercises WHERE exercise_id IN (${placeholders}) AND _deleted = 0`,
        exerciseIds
      );
      if (wes.length === 0) return {};

      const workoutIds = [...new Set(wes.map((we) => we.workout_id))];
      const wPlaceholders = workoutIds.map(() => "?").join(",");
      const workouts = await db.getAllAsync<{ id: string; date: string }>(
        `SELECT id, date FROM workouts WHERE id IN (${wPlaceholders}) AND _deleted = 0`,
        workoutIds
      );
      const dateByWorkout = new Map(workouts.map((w) => [w.id, w.date]));

      const result: Record<string, { date: string; maxWeight: number; maxReps: number; setCount: number }> = {};
      for (const we of wes) {
        const date = dateByWorkout.get(we.workout_id);
        if (!date) continue;
        if (result[we.exercise_id] && result[we.exercise_id]!.date >= date) continue;

        const sets = await db.getAllAsync<{ weight: number | null; reps: number | null }>(
          `SELECT weight, reps FROM sets WHERE workout_exercise_id = ? AND _deleted = 0 AND is_complete = 1 AND is_warmup = 0`,
          [we.id]
        );
        result[we.exercise_id] = {
          date,
          maxWeight: sets.length ? Math.max(...sets.map((s) => s.weight ?? 0)) : 0,
          maxReps: sets.length ? Math.max(...sets.map((s) => s.reps ?? 0)) : 0,
          setCount: sets.length,
        };
      }
      return result;
    },

    // ─── CSV import/export ─────────────────────────────────────────────────────

    /** Exporta TODO el historial de entrenamientos vivo a CSV (`Date,Exercise,Weight,Reps,Distance,Time,Comment,Completed,Warmup`), una fila por set (o una fila vacía de sets si el ejercicio no tiene ninguno) — réplica local de `workoutRepository.exportAllCSV`, mismo formato exacto para que un export local y uno remoto sean intercambiables. Comas en comentarios se sustituyen por `;` para no romper el CSV. */
    async exportAllCSV(): Promise<string> {
      const workoutsData = await db.getAllAsync<{ id: string; date: string; comment: string | null }>(
        `SELECT id, date, comment FROM workouts WHERE _deleted = 0 ORDER BY date ASC`
      );
      if (workoutsData.length === 0) return "";

      const workoutIds = workoutsData.map((w) => w.id);
      const wPlaceholders = workoutIds.map(() => "?").join(",");
      const wesData = await db.getAllAsync<{ id: string; workout_id: string; exercise_id: string; order_index: number }>(
        `SELECT id, workout_id, exercise_id, order_index FROM workout_exercises WHERE _deleted = 0 AND workout_id IN (${wPlaceholders}) ORDER BY order_index ASC`,
        workoutIds
      );
      if (wesData.length === 0) return "";

      const exerciseIds = [...new Set(wesData.map((we) => we.exercise_id))];
      const exPlaceholders = exerciseIds.map(() => "?").join(",");
      const exRows = await db.getAllAsync<{ id: string; name: string }>(
        `SELECT id, name FROM exercises WHERE id IN (${exPlaceholders})`,
        exerciseIds
      );
      const nameMap: Record<string, string> = {};
      for (const ex of exRows) nameMap[ex.id] = ex.name;

      const weIds = wesData.map((we) => we.id);
      const wePlaceholders = weIds.map(() => "?").join(",");
      const setsData = await db.getAllAsync<{
        workout_exercise_id: string; weight: number | null; reps: number | null;
        distance: number | null; time_seconds: number | null; comment: string | null;
        is_complete: number; is_warmup: number; order_index: number;
      }>(
        `SELECT workout_exercise_id, weight, reps, distance, time_seconds, comment, is_complete, is_warmup, order_index
         FROM sets WHERE _deleted = 0 AND workout_exercise_id IN (${wePlaceholders}) ORDER BY order_index ASC`,
        weIds
      );

      const setsByWE: Record<string, typeof setsData> = {};
      for (const s of setsData) (setsByWE[s.workout_exercise_id] ??= []).push(s);

      const workoutById: Record<string, { date: string; comment: string | null }> = {};
      for (const w of workoutsData) workoutById[w.id] = { date: w.date, comment: w.comment };

      const rows: string[] = ["Date,Exercise,Weight,Reps,Distance,Time,Comment,Completed,Warmup"];
      for (const we of wesData) {
        const workout = workoutById[we.workout_id];
        if (!workout) continue;
        const exName = nameMap[we.exercise_id] ?? we.exercise_id;
        const weSets = setsByWE[we.id] ?? [];
        if (weSets.length === 0) {
          rows.push([workout.date, exName, "", "", "", "", workout.comment ?? "", ""].join(","));
        } else {
          for (const s of weSets) {
            const comment = (s.comment ?? workout.comment ?? "").replace(/,/g, ";");
            rows.push([
              workout.date, exName,
              s.weight ?? "", s.reps ?? "",
              s.distance ?? "", s.time_seconds ?? "",
              comment, s.is_complete ? "1" : "0",
              s.is_warmup ? "1" : "0",
            ].join(","));
          }
        }
      }
      return rows.join("\n");
    },

    /**
     * Importa entrenamientos desde filas de CSV ya parseadas: agrupa por fecha y,
     * dentro de cada fecha, por nombre de ejercicio (preservando el orden de
     * aparición); crea ejercicios nuevos sobre la marcha si el nombre no existe
     * (case-insensitive) por defecto como `WEIGHT_REPS`/kg. Si ya existe un
     * entrenamiento en una fecha del CSV, esa fecha entera se omite (`skipped`)
     * para no duplicar — no hace merge parcial. Réplica local de
     * `workoutRepository.importFromCSV`; a diferencia del remoto (donde el
     * trigger SQL genera los PRs al insertar), aquí se llama a
     * `maybeRecordPersonalRecord` explícitamente por cada set completo insertado.
     */
    async importFromCSV(
      rows: Array<{
        date: string;
        exerciseName: string;
        weight?: number;
        reps?: number;
        distance?: number;
        timeSecs?: number;
        comment?: string;
        isComplete: boolean;
        isWarmup: boolean;
      }>,
      userId: string
    ): Promise<{ imported: number; skipped: number; newExercises: number }> {
      if (rows.length === 0) return { imported: 0, skipped: 0, newExercises: 0 };

      const exData = await db.getAllAsync<{ id: string; name: string }>(`SELECT id, name FROM exercises WHERE _deleted = 0`);
      const nameToId = new Map<string, string>(exData.map((e) => [e.name.toLowerCase(), e.id]));
      let newExercises = 0;

      async function resolveExercise(name: string): Promise<string> {
        const key = name.toLowerCase();
        if (nameToId.has(key)) return nameToId.get(key)!;
        const id = generateUUID();
        const ts = nowIso();
        const row: ExerciseRow = {
          id, user_id: userId, category_id: null, name, notes: null,
          type: "WEIGHT_REPS", weight_unit: "kg", is_favorite: false,
          weight_increment: null, default_rest_seconds: null, default_chart: null, demo_url: null,
          created_at: ts, updated_at: ts,
        };
        await db.runAsync(
          `INSERT INTO exercises (id, user_id, category_id, name, notes, type, weight_unit, is_favorite, weight_increment, default_rest_seconds, default_chart, demo_url, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, NULL, ?, NULL, ?, ?, 0, NULL, NULL, NULL, NULL, ?, ?, 1, 0)`,
          [row.id, row.user_id, row.name, row.type, row.weight_unit, row.created_at, row.updated_at]
        );
        await enqueuePendingOp(db, "exercises", id, "insert", row);
        nameToId.set(key, id);
        newExercises++;
        return id;
      }

      // Group by date
      const byDate = new Map<string, typeof rows>();
      for (const row of rows) {
        if (!row.date || !row.exerciseName) continue;
        if (!byDate.has(row.date)) byDate.set(row.date, []);
        byDate.get(row.date)!.push(row);
      }

      const dates = [...byDate.keys()];
      const datePlaceholders = dates.map(() => "?").join(",");
      const existingWorkouts = dates.length > 0
        ? await db.getAllAsync<{ date: string }>(`SELECT date FROM workouts WHERE _deleted = 0 AND date IN (${datePlaceholders})`, dates)
        : [];
      const existingDates = new Set(existingWorkouts.map((w) => w.date));

      let imported = 0;
      let skipped = 0;

      await db.withTransactionAsync(async () => {
        for (const [date, dateRows] of byDate) {
          if (existingDates.has(date)) { skipped += dateRows.length; continue; }

          const workoutId = generateUUID();
          const wTs = nowIso();
          const workoutRow: WorkoutRow = {
            id: workoutId, user_id: userId, date, comment: null, start_time: null, end_time: null,
            duration_minutes: null, created_at: wTs, updated_at: wTs,
          };
          await db.runAsync(
            `INSERT INTO workouts (id, user_id, date, comment, start_time, end_time, duration_minutes, created_at, updated_at, _dirty, _deleted)
             VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, 1, 0)`,
            [workoutRow.id, workoutRow.user_id, workoutRow.date, workoutRow.created_at, workoutRow.updated_at]
          );
          await enqueuePendingOp(db, "workouts", workoutId, "insert", workoutRow);

          // Group by exercise within this date (preserve order)
          const exOrder: string[] = [];
          const byEx = new Map<string, typeof dateRows>();
          for (const row of dateRows) {
            const key = row.exerciseName;
            if (!byEx.has(key)) { exOrder.push(key); byEx.set(key, []); }
            byEx.get(key)!.push(row);
          }

          let exIdx = 0;
          for (const exName of exOrder) {
            const exerciseId = await resolveExercise(exName);
            const weId = generateUUID();
            const weTs = nowIso();
            const weRow: WorkoutExerciseRow = {
              id: weId, user_id: userId, workout_id: workoutId, exercise_id: exerciseId,
              order_index: exIdx, group_id: null, group_name: null, created_at: weTs, updated_at: weTs,
            };
            await db.runAsync(
              `INSERT INTO workout_exercises (id, user_id, workout_id, exercise_id, order_index, group_id, group_name, created_at, updated_at, _dirty, _deleted)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, 1, 0)`,
              [weRow.id, weRow.user_id, weRow.workout_id, weRow.exercise_id, weRow.order_index, weRow.created_at, weRow.updated_at]
            );
            await enqueuePendingOp(db, "workout_exercises", weId, "insert", weRow);
            exIdx++;

            const exRows = byEx.get(exName) ?? [];
            for (let i = 0; i < exRows.length; i++) {
              const r = exRows[i]!;
              const setId = generateUUID();
              const setTs = nowIso();
              const setRow: SetRow = {
                id: setId, user_id: userId, workout_exercise_id: weId, order_index: i,
                weight: r.weight ?? null, reps: r.reps ?? null, distance: r.distance ?? null, time_seconds: r.timeSecs ?? null,
                is_complete: r.isComplete, is_warmup: r.isWarmup, comment: r.comment ?? null,
                created_at: setTs, updated_at: setTs,
              };
              await db.runAsync(
                `INSERT INTO sets (id, user_id, workout_exercise_id, order_index, weight, reps, distance, time_seconds, is_complete, is_warmup, comment, created_at, updated_at, _dirty, _deleted)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
                [
                  setRow.id, setRow.user_id, setRow.workout_exercise_id, setRow.order_index,
                  setRow.weight, setRow.reps, setRow.distance, setRow.time_seconds,
                  fromBool(setRow.is_complete), fromBool(setRow.is_warmup), setRow.comment,
                  setRow.created_at, setRow.updated_at,
                ]
              );
              await enqueuePendingOp(db, "sets", setId, "insert", setRow);
              if (setRow.is_complete) await maybeRecordPersonalRecord(db, setRow as unknown as RawRow);
              imported++;
            }
          }
        }
      });

      return { imported, skipped, newExercises };
    },

    /**
     * Reparación de un solo uso (ver `app_migrations`/`RepositoryContext`):
     * recalcula el ledger de TODOS los ejercicios que tengan alguna fila en
     * `personal_records`, incluidos los que ya quedaron huérfanos antes de
     * que `deleteWorkout`/`removeExercise`/`deleteSet` empezaran a llamar a
     * `resyncPersonalRecordsForExercise`. Un PR ya correcto se recalcula
     * igual (no hay forma barata de saber cuáles están rotos sin hacerlo).
     */
    async repairOrphanedPersonalRecords(userId: string): Promise<void> {
      const exercises = await db.getAllAsync<{ exercise_id: string }>(
        `SELECT DISTINCT exercise_id FROM personal_records WHERE user_id = ? AND _deleted = 0`,
        [userId]
      );
      for (const { exercise_id } of exercises) {
        await resyncPersonalRecordsForExercise(db, exercise_id, userId);
      }
    },
  };
}

/** Tipo del repositorio devuelto por {@link createLocalWorkoutRepository}. */
export type LocalWorkoutRepository = ReturnType<typeof createLocalWorkoutRepository>;
