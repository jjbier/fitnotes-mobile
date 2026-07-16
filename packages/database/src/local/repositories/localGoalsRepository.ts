import { generateUUID } from "@fitnotes/core";
import type { SqlExecutor } from "../sqlExecutor.js";
import { enqueuePendingOp } from "../pendingOps.js";
import { nowIso, type RawRow, type RepoError } from "./shared.js";
import type { ExerciseGoalRow } from "../../repositories/goalsRepository.js";

function mapGoalRow(row: RawRow): ExerciseGoalRow {
  return {
    id: row.id as string,
    exercise_id: row.exercise_id as string,
    target_weight: (row.target_weight as number | null) ?? undefined,
    target_reps: (row.target_reps as number | null) ?? undefined,
    target_date: (row.target_date as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    achieved_at: (row.achieved_at as string | null) ?? undefined,
    created_at: row.created_at as string,
  };
}

/**
 * Repositorio local de goals — espeja createGoalsRepository() método a
 * método. `upsertGoal` traduce el `onConflict: "user_id,exercise_id"`
 * remoto a un `INSERT ... ON CONFLICT DO UPDATE` local sobre esas mismas
 * columnas.
 */
export function createLocalGoalsRepository(db: SqlExecutor) {
  return {
    /** Lee todos los goals (`exercise_goals`) del usuario activo, sin cascada ni encolado (solo lectura). */
    async getGoals(): Promise<ExerciseGoalRow[]> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM exercise_goals WHERE _deleted = 0 ORDER BY created_at DESC`
      );
      return rows.map(mapGoalRow);
    },

    /**
     * Crea o actualiza el goal de `(user_id, exercise_id)` en `exercise_goals`
     * — INSERT si no existe fila viva, UPDATE si ya hay una. Encola el
     * `pending_op` correspondiente en la misma transacción.
     */
    async upsertGoal(
      goal: Omit<ExerciseGoalRow, "id" | "created_at">,
      userId: string
    ): Promise<ExerciseGoalRow | null> {
      const ts = nowIso();
      const existing = await db.getFirstAsync<RawRow>(
        `SELECT * FROM exercise_goals WHERE user_id = ? AND exercise_id = ? AND _deleted = 0`,
        [userId, goal.exercise_id]
      );

      if (existing) {
        const id = existing.id as string;
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `UPDATE exercise_goals SET target_weight = ?, target_reps = ?, target_date = ?, notes = ?, achieved_at = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
            [
              goal.target_weight ?? null, goal.target_reps ?? null, goal.target_date ?? null,
              goal.notes ?? null, goal.achieved_at ?? null, ts, id,
            ]
          );
          await enqueuePendingOp(db, "exercise_goals", id, "update", {
            target_weight: goal.target_weight ?? null,
            target_reps: goal.target_reps ?? null,
            target_date: goal.target_date ?? null,
            notes: goal.notes ?? null,
            achieved_at: goal.achieved_at ?? null,
            updated_at: ts,
          });
        });
        const row = await db.getFirstAsync<RawRow>(`SELECT * FROM exercise_goals WHERE id = ?`, [id]);
        return row ? mapGoalRow(row) : null;
      }

      const id = generateUUID();
      const row = {
        id,
        user_id: userId,
        exercise_id: goal.exercise_id,
        target_weight: goal.target_weight ?? null,
        target_reps: goal.target_reps ?? null,
        target_date: goal.target_date ?? null,
        notes: goal.notes ?? null,
        achieved_at: goal.achieved_at ?? null,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO exercise_goals (id, user_id, exercise_id, target_weight, target_reps, target_date, notes, achieved_at, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [
            row.id, row.user_id, row.exercise_id, row.target_weight, row.target_reps,
            row.target_date, row.notes, row.achieved_at, row.created_at, row.updated_at,
          ]
        );
        await enqueuePendingOp(db, "exercise_goals", id, "insert", row);
      });
      return mapGoalRow(row);
    },

    /** Tombstonea (`_deleted=1`) el goal del ejercicio dado en `exercise_goals` y encola su delete. No-op si no hay goal vivo. */
    async deleteGoal(exerciseId: string): Promise<{ error: RepoError | null }> {
      const existing = await db.getFirstAsync<RawRow>(
        `SELECT id FROM exercise_goals WHERE exercise_id = ? AND _deleted = 0`,
        [exerciseId]
      );
      if (!existing) return { error: null };
      const id = existing.id as string;
      await db.withTransactionAsync(async () => {
        const ts = nowIso();
        await db.runAsync(`UPDATE exercise_goals SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, id]);
        await enqueuePendingOp(db, "exercise_goals", id, "delete", null);
      });
      return { error: null };
    },

    /** Marca `achieved_at` con el timestamp actual en el goal del ejercicio dado y encola el update. No-op si no hay goal vivo. */
    async markAchieved(exerciseId: string): Promise<{ error: RepoError | null }> {
      const existing = await db.getFirstAsync<RawRow>(
        `SELECT id FROM exercise_goals WHERE exercise_id = ? AND _deleted = 0`,
        [exerciseId]
      );
      if (!existing) return { error: null };
      const id = existing.id as string;
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        await db.runAsync(`UPDATE exercise_goals SET achieved_at = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [ts, ts, id]);
        await enqueuePendingOp(db, "exercise_goals", id, "update", { achieved_at: ts, updated_at: ts });
      });
      return { error: null };
    },
  };
}

/** Tipo del repositorio devuelto por {@link createLocalGoalsRepository}. */
export type LocalGoalsRepository = ReturnType<typeof createLocalGoalsRepository>;
