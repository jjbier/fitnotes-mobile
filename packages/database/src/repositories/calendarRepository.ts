/**
 * Repositorio remoto de consultas orientadas al calendario/historial: agrega
 * entrenamientos, colores/categorías por día y detalle de sesión, a partir de
 * joins anidados de Supabase (`workouts` → `workout_exercises` → `exercises` → `categories`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;

// `new Date(year, month, 0).toISOString()` convierte a UTC — en cualquier
// timezone con offset positivo (p.ej. Europe/Madrid, UTC+2) esto resta un día
// al último día del mes, excluyéndolo de los rangos de fecha. `.getDate()`
// lee el día del mes en hora local, sin pasar por UTC.
/** Fecha ISO (YYYY-MM-DD) del último día del mes, calculada en hora local (ver nota arriba sobre el bug de UTC). */
function lastDayOfMonth(year: number, month: number): string {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function createCalendarRepository(client: Client) {
  return {
    /** Entrenamientos del mes (id/fecha/comentario/hora — puede haber varios por fecha) para pintar el calendario. */
    getWorkoutsForMonth(year: number, month: number) {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = lastDayOfMonth(year, month);
      return client
        .from("workouts")
        .select("id, date, comment, start_time")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
    },

    /** Colores de categoría únicos por fecha en el mes (para los puntos de color del calendario), deduplicados por categoría dentro de cada día. */
    async getWorkoutCategoryColorsForMonth(year: number, month: number): Promise<Record<string, string[]>> {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = lastDayOfMonth(year, month);
      const { data } = await client
        .from("workouts")
        .select("date, workout_exercises(exercises(categories(id, color)))")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      if (!data) return {};
      const result: Record<string, string[]> = {};
      type Row = { date: string; workout_exercises: { exercises: { categories: { id: string; color: string } | null } | null }[] | null };
      for (const w of data as Row[]) {
        const seen = new Set<string>();
        const colors: string[] = [];
        for (const we of w.workout_exercises ?? []) {
          const cat = we.exercises?.categories;
          if (cat && !seen.has(cat.id)) {
            seen.add(cat.id);
            colors.push(cat.color);
          }
        }
        if (colors.length > 0) result[w.date] = colors;
      }
      return result;
    },

    /** Entrenamiento de una fecha con sus ejercicios (nombre + id), sin sets — resumen rápido de día. */
    getWorkoutSummary(date: string) {
      return client
        .from("workouts")
        .select("id, date, comment, workout_exercises(exercise_id, exercises(name))")
        .eq("date", date)
        .single();
    },

    /** Últimos `limit` entrenamientos (id/fecha/comentario), sin detalle de ejercicios. */
    getWorkoutHistory(limit = 30) {
      return client
        .from("workouts")
        .select("id, date, comment")
        .order("date", { ascending: false })
        .limit(limit);
    },

    /** Como {@link getWorkoutHistory} pero con las categorías (id/nombre/color) trabajadas de cada entrenamiento, deduplicadas por sesión. */
    async getWorkoutHistoryDetailed(limit = 30): Promise<{
      id: string; date: string; comment: string | null;
      categories: { id: string; name: string; color: string }[];
    }[]> {
      const { data } = await client
        .from("workouts")
        .select("id, date, comment, workout_exercises(exercises(categories(id, name, color)))")
        .order("date", { ascending: false })
        .limit(limit);
      if (!data) return [];
      type Row = {
        id: string; date: string; comment: string | null;
        workout_exercises: { exercises: { categories: { id: string; name: string; color: string } | null } | null }[] | null;
      };
      return (data as Row[]).map((w) => {
        const seen = new Set<string>();
        const categories: { id: string; name: string; color: string }[] = [];
        for (const we of w.workout_exercises ?? []) {
          const cat = we.exercises?.categories;
          if (cat && !seen.has(cat.id)) { seen.add(cat.id); categories.push(cat); }
        }
        return { id: w.id, date: w.date, comment: w.comment, categories };
      });
    },

    /** Detalle completo de una sesión: ejercicios en orden y, para cada uno, todos sus sets (peso/reps/distancia/tiempo/estado). */
    getWorkoutSetDetail(workoutId: string) {
      return client
        .from("workouts")
        .select("id, date, workout_exercises(order_index, exercises(name), sets(weight, reps, distance, time_seconds, is_complete, is_warmup, order_index))")
        .eq("id", workoutId)
        .order("order_index", { referencedTable: "workout_exercises", ascending: true })
        .single();
    },

    /** Fechas (sin deduplicar ni ordenar) en que se entrenó un ejercicio, vía inner join a `workouts`. */
    getWorkoutDatesForExercise(exerciseId: string) {
      return client
        .from("workout_exercises")
        .select("workouts!inner(date)")
        .eq("exercise_id", exerciseId);
    },

    /** Igual que {@link getWorkoutCategoryColorsForMonth} pero devolviendo solo los ids de categoría por fecha (para filtrado, no para pintar). */
    async getWorkoutCategoryIdsForMonth(year: number, month: number): Promise<Record<string, string[]>> {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = lastDayOfMonth(year, month);
      const { data } = await client
        .from("workouts")
        .select("date, workout_exercises(exercises(categories(id)))")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      if (!data) return {};
      const result: Record<string, string[]> = {};
      type Row = { date: string; workout_exercises: { exercises: { categories: { id: string } | null } | null }[] | null };
      for (const w of data as Row[]) {
        const seen = new Set<string>();
        const ids: string[] = [];
        for (const we of w.workout_exercises ?? []) {
          const cat = we.exercises?.categories;
          if (cat && !seen.has(cat.id)) { seen.add(cat.id); ids.push(cat.id); }
        }
        if (ids.length > 0) result[w.date] = ids;
      }
      return result;
    },

    /**
     * Fechas únicas en que se entrenó un ejercicio, filtradas en memoria (no en SQL)
     * por peso/reps mínimos: si se pasa `minWeight` y/o `minReps`, una fecha solo
     * cuenta si al menos un set de esa sesión cumple TODAS las condiciones dadas.
     * Sin filtros, incluye cualquier fecha con el ejercicio registrado.
     */
    async getWorkoutDatesForExerciseWithConditions(
      exerciseId: string,
      minWeight?: number,
      minReps?: number,
    ): Promise<string[]> {
      const { data } = await client
        .from("workout_exercises")
        .select("workouts!inner(date), sets(weight, reps)")
        .eq("exercise_id", exerciseId);
      if (!data) return [];
      type Row = {
        workouts: { date: string } | null;
        sets: { weight: number | null; reps: number | null }[] | null;
      };
      const dates = new Set<string>();
      for (const we of data as Row[]) {
        const date = we.workouts?.date;
        if (!date) continue;
        if (minWeight == null && minReps == null) { dates.add(date); continue; }
        const match = (we.sets ?? []).some((s) => {
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

export type CalendarRepository = ReturnType<typeof createCalendarRepository>;
