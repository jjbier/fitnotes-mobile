import { generateUUID } from "@fitnotes/core";
import type { SqlExecutor } from "../sqlExecutor.js";
import { enqueuePendingOp } from "../pendingOps.js";
import type { Database } from "../../supabase/types.js";
import { nowIso, toBool, fromBool, type RawRow, type RepoError } from "./shared.js";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

function mapCategoryRow(row: RawRow): CategoryRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    color: row.color as string,
    order_index: row.order_index as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapExerciseRow(row: RawRow): ExerciseRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    category_id: (row.category_id as string | null) ?? null,
    name: row.name as string,
    notes: (row.notes as string | null) ?? null,
    type: row.type as ExerciseRow["type"],
    weight_unit: row.weight_unit as string,
    is_favorite: toBool(row.is_favorite),
    weight_increment: (row.weight_increment as number | null) ?? null,
    default_rest_seconds: (row.default_rest_seconds as number | null) ?? null,
    default_chart: (row.default_chart as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Repositorio local de ejercicios y categorías — espeja createExerciseRepository()
 * método a método para el CRUD. Los métodos de solo lectura/analítica pesada
 * (getExerciseHistory, convertExerciseWeights, getExerciseStats) se quedan en
 * el repo remoto (fuera de alcance offline, ver plan Fase 4).
 */
export function createLocalExerciseRepository(db: SqlExecutor) {
  return {
    // ─── Categories ────────────────────────────────────────────────────────────

    /** Lee `categories` vivas ordenadas por `order_index`. Solo lectura. */
    async getCategories(): Promise<{ data: CategoryRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM categories WHERE _deleted = 0 ORDER BY order_index ASC`
      );
      return { data: rows.map(mapCategoryRow), error: null };
    },

    /** Inserta una nueva categoría en `categories` con UUID de cliente y encola el insert. */
    async createCategory(
      data: { name: string; color?: string; order_index?: number },
      userId: string
    ): Promise<{ data: CategoryRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: CategoryRow = {
        id,
        user_id: userId,
        name: data.name,
        color: data.color ?? "#6366f1",
        order_index: data.order_index ?? 0,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [row.id, row.user_id, row.name, row.color, row.order_index, row.created_at, row.updated_at]
        );
        await enqueuePendingOp(db, "categories", id, "insert", row);
      });
      return { data: row, error: null };
    },

    /** Actualiza campos parciales de una categoría (UPDATE dinámico por claves presentes) y encola el update. */
    async updateCategory(
      id: string,
      data: { name?: string; color?: string; order_index?: number }
    ): Promise<{ data: CategoryRow | null; error: RepoError | null }> {
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
        await db.runAsync(`UPDATE categories SET ${cols.join(", ")} WHERE id = ?`, params);
        await enqueuePendingOp(db, "categories", id, "update", { ...data, updated_at: ts });
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM categories WHERE id = ?`, [id]);
      return { data: row ? mapCategoryRow(row) : null, error: null };
    },

    /**
     * Tombstonea una categoría y, a mano, pone `category_id = NULL` en todos
     * los ejercicios que la referenciaban — espeja el `ON DELETE SET NULL`
     * de la FK remota (bug conocido corregido: antes solo se tombstonaba la
     * categoría, dejando ejercicios con un `category_id` colgante). Un
     * `pending_op` de update por ejercicio afectado más el delete de la categoría.
     */
    async deleteCategory(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const ts = nowIso();
        // Espeja el ON DELETE SET NULL de la FK remota: los ejercicios de esta
        // categoría quedan sin categoría en vez de huérfanos con un category_id
        // apuntando a una fila ya borrada.
        const orphaned = await db.getAllAsync<RawRow>(
          `SELECT id FROM exercises WHERE category_id = ? AND _deleted = 0`,
          [id]
        );
        for (const row of orphaned) {
          const exerciseId = row.id as string;
          await db.runAsync(`UPDATE exercises SET category_id = NULL, updated_at = ?, _dirty = 1 WHERE id = ?`, [
            ts,
            exerciseId,
          ]);
          await enqueuePendingOp(db, "exercises", exerciseId, "update", { category_id: null, updated_at: ts });
        }
        await db.runAsync(`UPDATE categories SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [
          ts,
          id,
        ]);
        await enqueuePendingOp(db, "categories", id, "delete", null);
      });
      return { error: null };
    },

    /** Actualiza `order_index` de varias categorías, una `pending_op` de update por fila, todo en una transacción. */
    async reorderCategories(updates: { id: string; order_index: number }[]): Promise<{ error: RepoError | null }[]> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        for (const { id, order_index } of updates) {
          await db.runAsync(`UPDATE categories SET order_index = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
            order_index,
            ts,
            id,
          ]);
          await enqueuePendingOp(db, "categories", id, "update", { order_index, updated_at: ts });
        }
      });
      return updates.map(() => ({ error: null }));
    },

    // ─── Exercises ─────────────────────────────────────────────────────────────

    /** Lee `exercises` vivos, opcionalmente filtrados por categoría, ordenados por nombre. Solo lectura. */
    async getExercises(categoryId?: string): Promise<{ data: ExerciseRow[]; error: RepoError | null }> {
      const rows = categoryId
        ? await db.getAllAsync<RawRow>(
            `SELECT * FROM exercises WHERE _deleted = 0 AND category_id = ? ORDER BY name ASC`,
            [categoryId]
          )
        : await db.getAllAsync<RawRow>(`SELECT * FROM exercises WHERE _deleted = 0 ORDER BY name ASC`);
      return { data: rows.map(mapExerciseRow), error: null };
    },

    /** Inserta un nuevo ejercicio en `exercises` con UUID de cliente y encola el insert. */
    async createExercise(
      data: {
        name: string;
        category_id?: string | null;
        type: string;
        weight_unit?: string;
        notes?: string | null;
        is_favorite?: boolean;
        weight_increment?: number | null;
        default_rest_seconds?: number | null;
        default_chart?: string | null;
      },
      userId: string
    ): Promise<{ data: ExerciseRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: ExerciseRow = {
        id,
        user_id: userId,
        category_id: data.category_id ?? null,
        name: data.name,
        notes: data.notes ?? null,
        type: data.type as ExerciseRow["type"],
        weight_unit: data.weight_unit ?? "kg",
        is_favorite: data.is_favorite ?? false,
        weight_increment: data.weight_increment ?? null,
        default_rest_seconds: data.default_rest_seconds ?? null,
        default_chart: data.default_chart ?? null,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO exercises (id, user_id, category_id, name, notes, type, weight_unit, is_favorite, weight_increment, default_rest_seconds, default_chart, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [
            row.id, row.user_id, row.category_id, row.name, row.notes, row.type, row.weight_unit,
            fromBool(row.is_favorite), row.weight_increment, row.default_rest_seconds, row.default_chart,
            row.created_at, row.updated_at,
          ]
        );
        await enqueuePendingOp(db, "exercises", id, "insert", row);
      });
      return { data: row, error: null };
    },

    /** Actualiza campos parciales de un ejercicio (UPDATE dinámico por claves presentes, incluido `category_id`) y encola el update. */
    async updateExercise(
      id: string,
      data: {
        name?: string;
        category_id?: string | null;
        type?: string;
        weight_unit?: string;
        notes?: string | null;
        is_favorite?: boolean;
        weight_increment?: number | null;
        default_rest_seconds?: number | null;
        default_chart?: string | null;
      }
    ): Promise<{ data: ExerciseRow | null; error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        const cols: string[] = [];
        const params: unknown[] = [];
        for (const [key, value] of Object.entries(data)) {
          cols.push(`${key} = ?`);
          params.push(key === "is_favorite" ? fromBool(value as boolean) : value);
        }
        cols.push("updated_at = ?", "_dirty = 1");
        params.push(ts, id);
        await db.runAsync(`UPDATE exercises SET ${cols.join(", ")} WHERE id = ?`, params);
        await enqueuePendingOp(db, "exercises", id, "update", { ...data, updated_at: ts });
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM exercises WHERE id = ?`, [id]);
      return { data: row ? mapExerciseRow(row) : null, error: null };
    },

    /**
     * Tombstonea un ejercicio y, a mano, cascada sobre `workout_exercises`→`sets`
     * y `routine_day_exercises`→`predefined_sets` — espeja el `ON DELETE CASCADE`
     * remoto (bug conocido corregido: antes no cascadeaba y dejaba filas
     * huérfanas). Un `pending_op` de delete por cada fila afectada en las
     * cuatro tablas, más el del propio ejercicio.
     */
    async deleteExercise(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const ts = nowIso();
        // Espeja el ON DELETE CASCADE remoto sobre workout_exercises/sets y
        // routine_day_exercises/predefined_sets — sin esto quedarían filas
        // huérfanas apuntando a un ejercicio ya borrado.
        const workoutExercises = await db.getAllAsync<RawRow>(
          `SELECT id FROM workout_exercises WHERE exercise_id = ? AND _deleted = 0`,
          [id]
        );
        for (const we of workoutExercises) {
          const weId = we.id as string;
          const sets = await db.getAllAsync<RawRow>(
            `SELECT id FROM sets WHERE workout_exercise_id = ? AND _deleted = 0`,
            [weId]
          );
          for (const s of sets) {
            const setId = s.id as string;
            await db.runAsync(`UPDATE sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, setId]);
            await enqueuePendingOp(db, "sets", setId, "delete", null);
          }
          await db.runAsync(`UPDATE workout_exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, weId]);
          await enqueuePendingOp(db, "workout_exercises", weId, "delete", null);
        }

        const routineDayExercises = await db.getAllAsync<RawRow>(
          `SELECT id FROM routine_day_exercises WHERE exercise_id = ? AND _deleted = 0`,
          [id]
        );
        for (const rde of routineDayExercises) {
          const rdeId = rde.id as string;
          const predefinedSets = await db.getAllAsync<RawRow>(
            `SELECT id FROM predefined_sets WHERE routine_day_exercise_id = ? AND _deleted = 0`,
            [rdeId]
          );
          for (const ps of predefinedSets) {
            const psId = ps.id as string;
            await db.runAsync(`UPDATE predefined_sets SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, psId]);
            await enqueuePendingOp(db, "predefined_sets", psId, "delete", null);
          }
          await db.runAsync(`UPDATE routine_day_exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, rdeId]);
          await enqueuePendingOp(db, "routine_day_exercises", rdeId, "delete", null);
        }

        await db.runAsync(`UPDATE exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, id]);
        await enqueuePendingOp(db, "exercises", id, "delete", null);
      });
      return { error: null };
    },

    /** Actualiza `is_favorite` de un ejercicio y encola el update correspondiente. */
    async toggleFavorite(id: string, isFavorite: boolean): Promise<{ data: ExerciseRow | null; error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        await db.runAsync(`UPDATE exercises SET is_favorite = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
          fromBool(isFavorite),
          ts,
          id,
        ]);
        await enqueuePendingOp(db, "exercises", id, "update", { is_favorite: isFavorite, updated_at: ts });
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM exercises WHERE id = ?`, [id]);
      return { data: row ? mapExerciseRow(row) : null, error: null };
    },
  };
}

/** Tipo del repositorio devuelto por {@link createLocalExerciseRepository}. */
export type LocalExerciseRepository = ReturnType<typeof createLocalExerciseRepository>;
