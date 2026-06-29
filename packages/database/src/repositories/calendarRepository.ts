import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;

export function createCalendarRepository(client: Client) {
  return {
    getWorkoutsForMonth(year: number, month: number) {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = new Date(year, month, 0).toISOString().split("T")[0]!;
      return client
        .from("workouts")
        .select("id, date, comment")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
    },

    async getWorkoutCategoryColorsForMonth(year: number, month: number): Promise<Record<string, string[]>> {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = new Date(year, month, 0).toISOString().split("T")[0]!;
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

    getWorkoutSummary(date: string) {
      return client
        .from("workouts")
        .select("id, date, comment, workout_exercises(exercise_id, exercises(name))")
        .eq("date", date)
        .single();
    },

    getWorkoutHistory(limit = 30) {
      return client
        .from("workouts")
        .select("id, date, comment")
        .order("date", { ascending: false })
        .limit(limit);
    },

    getWorkoutDatesForExercise(exerciseId: string) {
      return client
        .from("workout_exercises")
        .select("workouts!inner(date)")
        .eq("exercise_id", exerciseId);
    },
  };
}

export type CalendarRepository = ReturnType<typeof createCalendarRepository>;
