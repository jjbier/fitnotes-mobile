import type { SqlExecutor } from "../sqlExecutor.js";
import { toBool, type RepoError } from "./shared.js";

// Mismo cálculo que calendarRepository.ts (remoto): día final de mes en hora
// local, nunca en UTC (ver comentario allí sobre el bug de offset).
function lastDayOfMonth(year: number, month: number): string {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Repositorio local del calendario/historial — espeja
 * createCalendarRepository() (packages/database/src/repositories/calendarRepository.ts)
 * método a método, mismos shapes de retorno, con joins hechos en JS sobre
 * las tablas locales (SQLite no tiene los joins anidados de PostgREST).
 * Todas las lecturas filtran `_deleted = 0` en cada tabla tocada.
 */
export function createLocalCalendarRepository(db: SqlExecutor) {
  return {
    /** Entrenamientos del mes (solo id/fecha/comentario) para pintar el calendario. */
    async getWorkoutsForMonth(year: number, month: number): Promise<{ data: { id: string; date: string; comment: string | null }[]; error: RepoError | null }> {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = lastDayOfMonth(year, month);
      const rows = await db.getAllAsync<{ id: string; date: string; comment: string | null }>(
        `SELECT id, date, comment FROM workouts WHERE _deleted = 0 AND date >= ? AND date <= ? ORDER BY date ASC`,
        [start, end]
      );
      return { data: rows, error: null };
    },

    /** Colores de categoría únicos por fecha en el mes (para los puntos de color del calendario), deduplicados por categoría dentro de cada día. */
    async getWorkoutCategoryColorsForMonth(year: number, month: number): Promise<Record<string, string[]>> {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = lastDayOfMonth(year, month);
      const rows = await db.getAllAsync<{ date: string; cat_id: string; color: string }>(
        `SELECT w.date as date, c.id as cat_id, c.color as color
         FROM workouts w
         JOIN workout_exercises we ON we.workout_id = w.id AND we._deleted = 0
         JOIN exercises e ON e.id = we.exercise_id AND e._deleted = 0
         JOIN categories c ON c.id = e.category_id AND c._deleted = 0
         WHERE w._deleted = 0 AND w.date >= ? AND w.date <= ?
         ORDER BY w.date ASC`,
        [start, end]
      );
      const result: Record<string, string[]> = {};
      const seenByDate: Record<string, Set<string>> = {};
      for (const row of rows) {
        const seen = (seenByDate[row.date] ??= new Set());
        if (seen.has(row.cat_id)) continue;
        seen.add(row.cat_id);
        (result[row.date] ??= []).push(row.color);
      }
      return result;
    },

    /** Igual que {@link getWorkoutCategoryColorsForMonth} pero devolviendo solo los ids de categoría por fecha (para filtrado, no para pintar). */
    async getWorkoutCategoryIdsForMonth(year: number, month: number): Promise<Record<string, string[]>> {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = lastDayOfMonth(year, month);
      const rows = await db.getAllAsync<{ date: string; cat_id: string }>(
        `SELECT w.date as date, c.id as cat_id
         FROM workouts w
         JOIN workout_exercises we ON we.workout_id = w.id AND we._deleted = 0
         JOIN exercises e ON e.id = we.exercise_id AND e._deleted = 0
         JOIN categories c ON c.id = e.category_id AND c._deleted = 0
         WHERE w._deleted = 0 AND w.date >= ? AND w.date <= ?
         ORDER BY w.date ASC`,
        [start, end]
      );
      const result: Record<string, string[]> = {};
      const seenByDate: Record<string, Set<string>> = {};
      for (const row of rows) {
        const seen = (seenByDate[row.date] ??= new Set());
        if (seen.has(row.cat_id)) continue;
        seen.add(row.cat_id);
        (result[row.date] ??= []).push(row.cat_id);
      }
      return result;
    },

    /** Entrenamiento de una fecha con sus ejercicios (nombre + id), sin sets — resumen rápido de día. */
    async getWorkoutSummary(date: string): Promise<{
      data: { id: string; date: string; comment: string | null; workout_exercises: { exercise_id: string; exercises: { name: string } | null }[] } | null;
      error: RepoError | null;
    }> {
      const workout = await db.getFirstAsync<{ id: string; date: string; comment: string | null }>(
        `SELECT id, date, comment FROM workouts WHERE date = ? AND _deleted = 0 ORDER BY created_at ASC LIMIT 1`,
        [date]
      );
      if (!workout) return { data: null, error: null };
      const wes = await db.getAllAsync<{ exercise_id: string; name: string | null }>(
        `SELECT we.exercise_id as exercise_id, e.name as name
         FROM workout_exercises we
         LEFT JOIN exercises e ON e.id = we.exercise_id AND e._deleted = 0
         WHERE we.workout_id = ? AND we._deleted = 0
         ORDER BY we.order_index ASC`,
        [workout.id]
      );
      return {
        data: {
          ...workout,
          workout_exercises: wes.map((we) => ({ exercise_id: we.exercise_id, exercises: we.name != null ? { name: we.name } : null })),
        },
        error: null,
      };
    },

    /** Últimos `limit` entrenamientos (id/fecha/comentario) con sus categorías (id/nombre/color), deduplicadas por sesión. */
    async getWorkoutHistoryDetailed(limit = 30): Promise<{
      id: string; date: string; comment: string | null;
      categories: { id: string; name: string; color: string }[];
    }[]> {
      const workouts = await db.getAllAsync<{ id: string; date: string; comment: string | null }>(
        `SELECT id, date, comment FROM workouts WHERE _deleted = 0 ORDER BY date DESC LIMIT ?`,
        [limit]
      );
      if (workouts.length === 0) return [];
      const placeholders = workouts.map(() => "?").join(",");
      const rows = await db.getAllAsync<{ workout_id: string; cat_id: string; name: string; color: string }>(
        `SELECT we.workout_id as workout_id, c.id as cat_id, c.name as name, c.color as color
         FROM workout_exercises we
         JOIN exercises e ON e.id = we.exercise_id AND e._deleted = 0
         JOIN categories c ON c.id = e.category_id AND c._deleted = 0
         WHERE we._deleted = 0 AND we.workout_id IN (${placeholders})`,
        workouts.map((w) => w.id)
      );
      const categoriesByWorkout: Record<string, { id: string; name: string; color: string }[]> = {};
      const seenByWorkout: Record<string, Set<string>> = {};
      for (const row of rows) {
        const seen = (seenByWorkout[row.workout_id] ??= new Set());
        if (seen.has(row.cat_id)) continue;
        seen.add(row.cat_id);
        (categoriesByWorkout[row.workout_id] ??= []).push({ id: row.cat_id, name: row.name, color: row.color });
      }
      return workouts.map((w) => ({ ...w, categories: categoriesByWorkout[w.id] ?? [] }));
    },

    /** Detalle completo de una sesión: ejercicios en orden y, para cada uno, todos sus sets (peso/reps/distancia/tiempo/estado). */
    async getWorkoutSetDetail(workoutId: string): Promise<{
      data: {
        id: string; date: string;
        workout_exercises: {
          order_index: number; exercises: { name: string } | null;
          sets: { weight: number | null; reps: number | null; distance: number | null; time_seconds: number | null; is_complete: boolean; is_warmup: boolean; order_index: number }[];
        }[];
      } | null;
      error: RepoError | null;
    }> {
      const workout = await db.getFirstAsync<{ id: string; date: string }>(
        `SELECT id, date FROM workouts WHERE id = ? AND _deleted = 0`,
        [workoutId]
      );
      if (!workout) return { data: null, error: null };
      const wes = await db.getAllAsync<{ id: string; order_index: number; name: string | null }>(
        `SELECT we.id as id, we.order_index as order_index, e.name as name
         FROM workout_exercises we
         LEFT JOIN exercises e ON e.id = we.exercise_id AND e._deleted = 0
         WHERE we.workout_id = ? AND we._deleted = 0
         ORDER BY we.order_index ASC`,
        [workout.id]
      );
      if (wes.length === 0) return { data: { ...workout, workout_exercises: [] }, error: null };
      const placeholders = wes.map(() => "?").join(",");
      const setRows = await db.getAllAsync<{
        workout_exercise_id: string; weight: number | null; reps: number | null; distance: number | null;
        time_seconds: number | null; is_complete: number; is_warmup: number | null; order_index: number;
      }>(
        `SELECT workout_exercise_id, weight, reps, distance, time_seconds, is_complete, is_warmup, order_index
         FROM sets WHERE _deleted = 0 AND workout_exercise_id IN (${placeholders})`,
        wes.map((we) => we.id)
      );
      const setsByWe: Record<string, typeof setRows> = {};
      for (const s of setRows) (setsByWe[s.workout_exercise_id] ??= []).push(s);

      return {
        data: {
          ...workout,
          workout_exercises: wes.map((we) => ({
            order_index: we.order_index,
            exercises: we.name != null ? { name: we.name } : null,
            sets: (setsByWe[we.id] ?? []).map((s) => ({
              weight: s.weight, reps: s.reps, distance: s.distance, time_seconds: s.time_seconds,
              is_complete: toBool(s.is_complete), is_warmup: toBool(s.is_warmup ?? 0), order_index: s.order_index,
            })),
          })),
        },
        error: null,
      };
    },

    /**
     * Fechas únicas en que se entrenó un ejercicio, filtradas en memoria por
     * peso/reps mínimos: si se pasa `minWeight` y/o `minReps`, una fecha solo
     * cuenta si al menos un set de esa sesión cumple TODAS las condiciones dadas.
     * Sin filtros, incluye cualquier fecha con el ejercicio registrado.
     */
    async getWorkoutDatesForExerciseWithConditions(
      exerciseId: string,
      minWeight?: number,
      minReps?: number
    ): Promise<string[]> {
      const rows = await db.getAllAsync<{ date: string; weight: number | null; reps: number | null }>(
        `SELECT w.date as date, s.weight as weight, s.reps as reps
         FROM workout_exercises we
         JOIN workouts w ON w.id = we.workout_id AND w._deleted = 0
         LEFT JOIN sets s ON s.workout_exercise_id = we.id AND s._deleted = 0
         WHERE we._deleted = 0 AND we.exercise_id = ?`,
        [exerciseId]
      );
      const byDate: Record<string, { weight: number | null; reps: number | null }[]> = {};
      for (const row of rows) (byDate[row.date] ??= []).push({ weight: row.weight, reps: row.reps });

      const dates = new Set<string>();
      for (const [date, sets] of Object.entries(byDate)) {
        if (minWeight == null && minReps == null) { dates.add(date); continue; }
        const match = sets.some((s) => {
          if (minWeight != null && (s.weight == null || s.weight < minWeight)) return false;
          if (minReps != null && (s.reps == null || s.reps < minReps)) return false;
          return true;
        });
        if (match) dates.add(date);
      }
      return [...dates];
    },
  };
}

/** Tipo del repositorio devuelto por {@link createLocalCalendarRepository}. */
export type LocalCalendarRepository = ReturnType<typeof createLocalCalendarRepository>;
