import { generateUUID } from "@fitnotes/core";
import type { SqlExecutor } from "../sqlExecutor.js";
import { enqueuePendingOp } from "../pendingOps.js";
import type { Database } from "../../supabase/types.js";
import { nowIso, type RawRow, type RepoError } from "./shared.js";

type RoutineRow = Database["public"]["Tables"]["routines"]["Row"];
type RoutineDayRow = Database["public"]["Tables"]["routine_days"]["Row"];
type RoutineDayExerciseRow = Database["public"]["Tables"]["routine_day_exercises"]["Row"];
type PredefinedSetRow = Database["public"]["Tables"]["predefined_sets"]["Row"];

function mapRoutineRow(row: RawRow): RoutineRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapDayRow(row: RawRow): RoutineDayRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    routine_id: row.routine_id as string,
    name: row.name as string,
    order_index: row.order_index as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapDayExerciseRow(row: RawRow): RoutineDayExerciseRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    routine_day_id: row.routine_day_id as string,
    exercise_id: row.exercise_id as string,
    order_index: row.order_index as number,
    group_id: (row.group_id as string | null) ?? null,
    group_name: (row.group_name as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapPredefinedSetRow(row: RawRow): PredefinedSetRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    routine_day_exercise_id: row.routine_day_exercise_id as string,
    order_index: row.order_index as number,
    weight: (row.weight as number | null) ?? null,
    reps: (row.reps as number | null) ?? null,
    distance: (row.distance as number | null) ?? null,
    time_seconds: (row.time_seconds as number | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Repositorio local de rutinas — espeja createRoutineRepository() método a
 * método. getRoutineStats (analítica sobre historial de entrenamientos) se
 * queda en el repo remoto, fuera de alcance offline.
 */
export function createLocalRoutineRepository(db: SqlExecutor) {
  return {
    // ─── Routines ──────────────────────────────────────────────────────────────

    /** Lee `routines` vivas del usuario, más antigua primero. Solo lectura. */
    async getRoutines(): Promise<{ data: RoutineRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM routines WHERE _deleted = 0 ORDER BY created_at ASC`
      );
      return { data: rows.map(mapRoutineRow), error: null };
    },

    /** Inserta una nueva rutina en `routines` con UUID de cliente y encola el insert. */
    async createRoutine(
      data: { name: string; notes?: string },
      userId: string
    ): Promise<{ data: RoutineRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: RoutineRow = {
        id,
        user_id: userId,
        name: data.name,
        notes: data.notes ?? null,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO routines (id, user_id, name, notes, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
          [row.id, row.user_id, row.name, row.notes, row.created_at, row.updated_at]
        );
        await enqueuePendingOp(db, "routines", id, "insert", row);
      });
      return { data: row, error: null };
    },

    /** Actualiza nombre/notas de una rutina en `routines` y encola el update. */
    async updateRoutine(
      id: string,
      data: { name?: string; notes?: string }
    ): Promise<{ data: RoutineRow | null; error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        await db.runAsync(`UPDATE routines SET name = ?, notes = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
          data.name,
          data.notes ?? null,
          ts,
          id,
        ]);
        await enqueuePendingOp(db, "routines", id, "update", { ...data, updated_at: ts });
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM routines WHERE id = ?`, [id]);
      return { data: row ? mapRoutineRow(row) : null, error: null };
    },

    /**
     * Tombstonea una rutina y cascada manual completa hacia abajo: cada
     * `routine_days` suyo → cada `routine_day_exercises` de ese día →
     * cada `predefined_sets` de ese ejercicio — espeja el `ON DELETE CASCADE`
     * remoto en las tres tablas hijas. Un `pending_op` de delete por cada
     * fila tombstonada en las cuatro tablas.
     */
    async deleteRoutine(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const days = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM routine_days WHERE routine_id = ? AND _deleted = 0`,
          [id]
        );
        for (const day of days) {
          const exercises = await db.getAllAsync<{ id: string }>(
            `SELECT id FROM routine_day_exercises WHERE routine_day_id = ? AND _deleted = 0`,
            [day.id]
          );
          for (const ex of exercises) {
            const sets = await db.getAllAsync<{ id: string }>(
              `SELECT id FROM predefined_sets WHERE routine_day_exercise_id = ? AND _deleted = 0`,
              [ex.id]
            );
            for (const s of sets) await enqueuePendingOp(db, "predefined_sets", s.id, "delete", null);
            await db.runAsync(
              `UPDATE predefined_sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE routine_day_exercise_id = ?`,
              [nowIso(), ex.id]
            );
            await enqueuePendingOp(db, "routine_day_exercises", ex.id, "delete", null);
          }
          await db.runAsync(
            `UPDATE routine_day_exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE routine_day_id = ?`,
            [nowIso(), day.id]
          );
          await enqueuePendingOp(db, "routine_days", day.id, "delete", null);
        }
        await db.runAsync(`UPDATE routine_days SET _deleted = 1, _dirty = 1, updated_at = ? WHERE routine_id = ?`, [
          nowIso(),
          id,
        ]);
        await db.runAsync(`UPDATE routines SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [nowIso(), id]);
        await enqueuePendingOp(db, "routines", id, "delete", null);
      });
      return { error: null };
    },

    /**
     * Clona en profundidad una rutina completa (rutina → días → ejercicios de
     * día → sets predefinidos) con IDs nuevos generados en cliente para cada
     * fila copiada, todo en una única transacción con un `pending_op` de
     * insert por cada fila nueva. Falla con `error` si `sourceId` no existe o
     * está tombstonado.
     */
    async copyRoutine(
      sourceId: string,
      newName: string,
      userId: string
    ): Promise<{ data: RoutineRow | null; error: RepoError | null }> {
      const src = await db.getFirstAsync<RawRow>(`SELECT * FROM routines WHERE id = ? AND _deleted = 0`, [sourceId]);
      if (!src) return { data: null, error: { message: "Rutina no encontrada" } };

      const newRoutine: RoutineRow = {
        id: generateUUID(),
        user_id: userId,
        name: newName,
        notes: (src.notes as string | null) ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO routines (id, user_id, name, notes, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
          [newRoutine.id, newRoutine.user_id, newRoutine.name, newRoutine.notes, newRoutine.created_at, newRoutine.updated_at]
        );
        await enqueuePendingOp(db, "routines", newRoutine.id, "insert", newRoutine);

        const days = await db.getAllAsync<RawRow>(
          `SELECT * FROM routine_days WHERE routine_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
          [sourceId]
        );
        for (const day of days) {
          const newDayId = generateUUID();
          const dayTs = nowIso();
          const newDay: RoutineDayRow = {
            id: newDayId,
            user_id: userId,
            routine_id: newRoutine.id,
            name: day.name as string,
            order_index: day.order_index as number,
            created_at: dayTs,
            updated_at: dayTs,
          };
          await db.runAsync(
            `INSERT INTO routine_days (id, user_id, routine_id, name, order_index, created_at, updated_at, _dirty, _deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [newDay.id, newDay.user_id, newDay.routine_id, newDay.name, newDay.order_index, newDay.created_at, newDay.updated_at]
          );
          await enqueuePendingOp(db, "routine_days", newDayId, "insert", newDay);

          const exercises = await db.getAllAsync<RawRow>(
            `SELECT * FROM routine_day_exercises WHERE routine_day_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
            [day.id as string]
          );
          for (const ex of exercises) {
            const newExId = generateUUID();
            const exTs = nowIso();
            const newEx: RoutineDayExerciseRow = {
              id: newExId,
              user_id: userId,
              routine_day_id: newDayId,
              exercise_id: ex.exercise_id as string,
              order_index: ex.order_index as number,
              group_id: (ex.group_id as string | null) ?? null,
              group_name: (ex.group_name as string | null) ?? null,
              created_at: exTs,
              updated_at: exTs,
            };
            await db.runAsync(
              `INSERT INTO routine_day_exercises (id, user_id, routine_day_id, exercise_id, order_index, group_id, group_name, created_at, updated_at, _dirty, _deleted)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
              [newEx.id, newEx.user_id, newEx.routine_day_id, newEx.exercise_id, newEx.order_index, newEx.group_id, newEx.group_name, newEx.created_at, newEx.updated_at]
            );
            await enqueuePendingOp(db, "routine_day_exercises", newExId, "insert", newEx);

            const sets = await db.getAllAsync<RawRow>(
              `SELECT * FROM predefined_sets WHERE routine_day_exercise_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
              [ex.id as string]
            );
            for (const s of sets) {
              const newSetId = generateUUID();
              const setTs = nowIso();
              const newSet: PredefinedSetRow = {
                id: newSetId,
                user_id: userId,
                routine_day_exercise_id: newExId,
                order_index: s.order_index as number,
                weight: (s.weight as number | null) ?? null,
                reps: (s.reps as number | null) ?? null,
                distance: (s.distance as number | null) ?? null,
                time_seconds: (s.time_seconds as number | null) ?? null,
                created_at: setTs,
                updated_at: setTs,
              };
              await db.runAsync(
                `INSERT INTO predefined_sets (id, user_id, routine_day_exercise_id, order_index, weight, reps, distance, time_seconds, created_at, updated_at, _dirty, _deleted)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
                [newSet.id, newSet.user_id, newSet.routine_day_exercise_id, newSet.order_index, newSet.weight, newSet.reps, newSet.distance, newSet.time_seconds, newSet.created_at, newSet.updated_at]
              );
              await enqueuePendingOp(db, "predefined_sets", newSetId, "insert", newSet);
            }
          }
        }
      });

      return { data: newRoutine, error: null };
    },

    // ─── Routine Days ──────────────────────────────────────────────────────────

    /** Lee los `routine_days` vivos de una rutina, ordenados por `order_index`. Solo lectura. */
    async getDays(routineId: string): Promise<{ data: RoutineDayRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM routine_days WHERE routine_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
        [routineId]
      );
      return { data: rows.map(mapDayRow), error: null };
    },

    /** Inserta un nuevo día de rutina en `routine_days` con UUID de cliente y encola el insert. */
    async createDay(
      data: { routine_id: string; name: string; order_index: number },
      userId: string
    ): Promise<{ data: RoutineDayRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: RoutineDayRow = {
        id,
        user_id: userId,
        routine_id: data.routine_id,
        name: data.name,
        order_index: data.order_index,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO routine_days (id, user_id, routine_id, name, order_index, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [row.id, row.user_id, row.routine_id, row.name, row.order_index, row.created_at, row.updated_at]
        );
        await enqueuePendingOp(db, "routine_days", id, "insert", row);
      });
      return { data: row, error: null };
    },

    /** Actualiza campos parciales de un día de rutina (UPDATE dinámico por claves presentes) y encola el update. */
    async updateDay(
      id: string,
      data: { name?: string; order_index?: number }
    ): Promise<{ data: RoutineDayRow | null; error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        const cols: string[] = [];
        const params: unknown[] = [];
        for (const [key, value] of Object.entries(data)) {
          cols.push(`${key} = ?`);
          params.push(value);
        }
        cols.push("updated_at = ?", "_dirty = 1");
        params.push(ts, id);
        await db.runAsync(`UPDATE routine_days SET ${cols.join(", ")} WHERE id = ?`, params);
        await enqueuePendingOp(db, "routine_days", id, "update", { ...data, updated_at: ts });
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM routine_days WHERE id = ?`, [id]);
      return { data: row ? mapDayRow(row) : null, error: null };
    },

    /**
     * Tombstonea un día de rutina y cascada manual hacia sus
     * `routine_day_exercises` y los `predefined_sets` de cada uno — espeja el
     * `ON DELETE CASCADE` remoto. Un `pending_op` de delete por fila afectada.
     */
    async deleteDay(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const exercises = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM routine_day_exercises WHERE routine_day_id = ? AND _deleted = 0`,
          [id]
        );
        for (const ex of exercises) {
          const sets = await db.getAllAsync<{ id: string }>(
            `SELECT id FROM predefined_sets WHERE routine_day_exercise_id = ? AND _deleted = 0`,
            [ex.id]
          );
          for (const s of sets) await enqueuePendingOp(db, "predefined_sets", s.id, "delete", null);
          await db.runAsync(
            `UPDATE predefined_sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE routine_day_exercise_id = ?`,
            [nowIso(), ex.id]
          );
          await enqueuePendingOp(db, "routine_day_exercises", ex.id, "delete", null);
        }
        await db.runAsync(
          `UPDATE routine_day_exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE routine_day_id = ?`,
          [nowIso(), id]
        );
        await db.runAsync(`UPDATE routine_days SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [
          nowIso(),
          id,
        ]);
        await enqueuePendingOp(db, "routine_days", id, "delete", null);
      });
      return { error: null };
    },

    // ─── Routine Day Exercises ─────────────────────────────────────────────────

    /** Lee los `routine_day_exercises` vivos de un día, ordenados por `order_index`. Solo lectura. */
    async getDayExercises(dayId: string): Promise<{ data: RoutineDayExerciseRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM routine_day_exercises WHERE routine_day_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
        [dayId]
      );
      return { data: rows.map(mapDayExerciseRow), error: null };
    },

    /** Añade un ejercicio a un día de rutina en `routine_day_exercises` con UUID de cliente y encola el insert. */
    async addExercise(
      data: { routine_day_id: string; exercise_id: string; order_index: number; group_id?: string },
      userId: string
    ): Promise<{ data: RoutineDayExerciseRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: RoutineDayExerciseRow = {
        id,
        user_id: userId,
        routine_day_id: data.routine_day_id,
        exercise_id: data.exercise_id,
        order_index: data.order_index,
        group_id: data.group_id ?? null,
        group_name: null,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO routine_day_exercises (id, user_id, routine_day_id, exercise_id, order_index, group_id, group_name, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [row.id, row.user_id, row.routine_day_id, row.exercise_id, row.order_index, row.group_id, row.group_name, row.created_at, row.updated_at]
        );
        await enqueuePendingOp(db, "routine_day_exercises", id, "insert", row);
      });
      return { data: row, error: null };
    },

    /** Actualiza `group_id`/`group_name` (supersets) de un ejercicio de rutina y encola el update. */
    async updateDayExercise(
      id: string,
      data: { group_id?: string | null; group_name?: string | null }
    ): Promise<{ data: RoutineDayExerciseRow | null; error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        const cols: string[] = [];
        const params: unknown[] = [];
        for (const [key, value] of Object.entries(data)) {
          cols.push(`${key} = ?`);
          params.push(value);
        }
        cols.push("updated_at = ?", "_dirty = 1");
        params.push(ts, id);
        await db.runAsync(`UPDATE routine_day_exercises SET ${cols.join(", ")} WHERE id = ?`, params);
        await enqueuePendingOp(db, "routine_day_exercises", id, "update", { ...data, updated_at: ts });
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM routine_day_exercises WHERE id = ?`, [id]);
      return { data: row ? mapDayExerciseRow(row) : null, error: null };
    },

    /** Propaga `group_name` a todos los `routine_day_exercises` que comparten `group_id` (superset), un `pending_op` de update por fila. */
    async updateDayGroupName(groupId: string, name: string): Promise<{ error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM routine_day_exercises WHERE group_id = ?`, [
          groupId,
        ]);
        for (const r of rows) {
          await db.runAsync(`UPDATE routine_day_exercises SET group_name = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
            name || null,
            ts,
            r.id,
          ]);
          await enqueuePendingOp(db, "routine_day_exercises", r.id, "update", { group_name: name || null, updated_at: ts });
        }
      });
      return { error: null };
    },

    /**
     * Tombstonea un `routine_day_exercises` y cascada manual sobre sus
     * `predefined_sets` — espeja el `ON DELETE CASCADE` remoto. Un
     * `pending_op` de delete por set más el del propio ejercicio de rutina.
     */
    async removeExercise(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const sets = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM predefined_sets WHERE routine_day_exercise_id = ? AND _deleted = 0`,
          [id]
        );
        for (const s of sets) await enqueuePendingOp(db, "predefined_sets", s.id, "delete", null);
        await db.runAsync(
          `UPDATE predefined_sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE routine_day_exercise_id = ?`,
          [nowIso(), id]
        );
        await db.runAsync(`UPDATE routine_day_exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [
          nowIso(),
          id,
        ]);
        await enqueuePendingOp(db, "routine_day_exercises", id, "delete", null);
      });
      return { error: null };
    },

    /** Actualiza `order_index` de varios `routine_day_exercises`, una `pending_op` de update por fila, todo en una transacción. */
    async reorderExercises(updates: { id: string; order_index: number }[]): Promise<{ error: RepoError | null }[]> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        for (const { id, order_index } of updates) {
          await db.runAsync(`UPDATE routine_day_exercises SET order_index = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
            order_index,
            ts,
            id,
          ]);
          await enqueuePendingOp(db, "routine_day_exercises", id, "update", { order_index, updated_at: ts });
        }
      });
      return updates.map(() => ({ error: null }));
    },

    /** Actualiza `order_index` de varios `routine_days`, una `pending_op` de update por fila, todo en una transacción. */
    async reorderDays(updates: { id: string; order_index: number }[]): Promise<{ error: RepoError | null }[]> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        for (const { id, order_index } of updates) {
          await db.runAsync(`UPDATE routine_days SET order_index = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
            order_index,
            ts,
            id,
          ]);
          await enqueuePendingOp(db, "routine_days", id, "update", { order_index, updated_at: ts });
        }
      });
      return updates.map(() => ({ error: null }));
    },

    // ─── Predefined Sets ───────────────────────────────────────────────────────

    /** Lee los `predefined_sets` vivos de un ejercicio de rutina, ordenados por `order_index`. Solo lectura. */
    async getPredefinedSets(routineDayExerciseId: string): Promise<{ data: PredefinedSetRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM predefined_sets WHERE routine_day_exercise_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
        [routineDayExerciseId]
      );
      return { data: rows.map(mapPredefinedSetRow), error: null };
    },

    /**
     * Reemplaza todos los `predefined_sets` de un ejercicio de rutina:
     * tombstonea los existentes (con su `pending_op` de delete) e inserta los
     * nuevos con UUIDs de cliente — más simple que hacer diff campo a campo,
     * dado que el set de predefinidos siempre se edita como bloque desde la UI.
     */
    async savePredefinedSets(
      routineDayExerciseId: string,
      sets: Array<{ weight?: number; reps?: number; distance?: number; time_seconds?: number; order_index: number }>,
      userId: string
    ): Promise<{ data: PredefinedSetRow[]; error: RepoError | null }> {
      const created: PredefinedSetRow[] = [];
      await db.withTransactionAsync(async () => {
        const existing = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM predefined_sets WHERE routine_day_exercise_id = ? AND _deleted = 0`,
          [routineDayExerciseId]
        );
        for (const row of existing) await enqueuePendingOp(db, "predefined_sets", row.id, "delete", null);
        await db.runAsync(
          `UPDATE predefined_sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE routine_day_exercise_id = ?`,
          [nowIso(), routineDayExerciseId]
        );

        for (const s of sets) {
          const id = generateUUID();
          const ts = nowIso();
          const row: PredefinedSetRow = {
            id,
            user_id: userId,
            routine_day_exercise_id: routineDayExerciseId,
            order_index: s.order_index,
            weight: s.weight ?? null,
            reps: s.reps ?? null,
            distance: s.distance ?? null,
            time_seconds: s.time_seconds ?? null,
            created_at: ts,
            updated_at: ts,
          };
          await db.runAsync(
            `INSERT INTO predefined_sets (id, user_id, routine_day_exercise_id, order_index, weight, reps, distance, time_seconds, created_at, updated_at, _dirty, _deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [row.id, row.user_id, row.routine_day_exercise_id, row.order_index, row.weight, row.reps, row.distance, row.time_seconds, row.created_at, row.updated_at]
          );
          await enqueuePendingOp(db, "predefined_sets", id, "insert", row);
          created.push(row);
        }
      });
      return { data: created, error: null };
    },
  };
}

/** Tipo del repositorio devuelto por {@link createLocalRoutineRepository}. */
export type LocalRoutineRepository = ReturnType<typeof createLocalRoutineRepository>;
