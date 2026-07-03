import { generateUUID } from "@fitnotes/core";
import type { SqlExecutor } from "../sqlExecutor.js";
import { enqueuePendingOp } from "../pendingOps.js";
import type { Database } from "../../supabase/types.js";

type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];
type WorkoutExerciseRow = Database["public"]["Tables"]["workout_exercises"]["Row"];
type SetRow = Database["public"]["Tables"]["sets"]["Row"];

interface RepoError {
  message: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toBool(v: unknown): boolean {
  return v === 1 || v === true;
}

function fromBool(v: boolean | undefined): number {
  return v ? 1 : 0;
}

// Fila SQLite cruda (booleans como 0/1, más columnas de control _dirty/_deleted)
interface RawRow {
  [key: string]: unknown;
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
 * importFromCSV/exportAllCSV/shareWorkout/deleteWorkoutHistory se quedan
 * fuera — siguen requiriendo red (ver plan, "fuera de alcance").
 */
export function createLocalWorkoutRepository(db: SqlExecutor) {
  return {
    // ─── Workouts ──────────────────────────────────────────────────────────────

    async getWorkoutByDate(date: string): Promise<{ data: WorkoutRow | null; error: RepoError | null }> {
      const row = await db.getFirstAsync<RawRow>(
        `SELECT * FROM workouts WHERE date = ? AND _deleted = 0 ORDER BY created_at ASC LIMIT 1`,
        [date]
      );
      return { data: row ? mapWorkoutRow(row) : null, error: null };
    },

    async getWorkouts(limit = 30): Promise<{ data: WorkoutRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM workouts WHERE _deleted = 0 ORDER BY date DESC LIMIT ?`,
        [limit]
      );
      return { data: rows.map(mapWorkoutRow), error: null };
    },

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

    async deleteWorkout(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const wes = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM workout_exercises WHERE workout_id = ? AND _deleted = 0`,
          [id]
        );
        for (const we of wes) {
          await db.runAsync(`UPDATE sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE workout_exercise_id = ?`, [
            nowIso(),
            we.id,
          ]);
          const setRows = await db.getAllAsync<{ id: string }>(`SELECT id FROM sets WHERE workout_exercise_id = ?`, [we.id]);
          for (const s of setRows) await enqueuePendingOp(db, "sets", s.id, "delete", null);
          await db.runAsync(`UPDATE workout_exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [
            nowIso(),
            we.id,
          ]);
          await enqueuePendingOp(db, "workout_exercises", we.id, "delete", null);
        }
        await db.runAsync(`UPDATE workouts SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [nowIso(), id]);
        await enqueuePendingOp(db, "workouts", id, "delete", null);
      });
      return { error: null };
    },

    // ─── Workout Exercises ─────────────────────────────────────────────────────

    async getWorkoutExercises(workoutId: string): Promise<{ data: WorkoutExerciseRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM workout_exercises WHERE workout_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
        [workoutId]
      );
      return { data: rows.map(mapWorkoutExerciseRow), error: null };
    },

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

    async removeExercise(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const ts = nowIso();
        await db.runAsync(`UPDATE sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE workout_exercise_id = ?`, [ts, id]);
        const setRows = await db.getAllAsync<{ id: string }>(`SELECT id FROM sets WHERE workout_exercise_id = ?`, [id]);
        for (const s of setRows) await enqueuePendingOp(db, "sets", s.id, "delete", null);
        await db.runAsync(`UPDATE workout_exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, id]);
        await enqueuePendingOp(db, "workout_exercises", id, "delete", null);
      });
      return { error: null };
    },

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

    async getSets(workoutExerciseId: string): Promise<{ data: SetRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM sets WHERE workout_exercise_id = ? AND _deleted = 0 ORDER BY order_index ASC`,
        [workoutExerciseId]
      );
      return { data: rows.map(mapSetRow), error: null };
    },

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
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM sets WHERE id = ?`, [id]);
      return { data: row ? mapSetRow(row) : null, error: null };
    },

    async deleteSet(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        await db.runAsync(`UPDATE sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [nowIso(), id]);
        await enqueuePendingOp(db, "sets", id, "delete", null);
      });
      return { error: null };
    },

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
  };
}

export type LocalWorkoutRepository = ReturnType<typeof createLocalWorkoutRepository>;
