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
  };
}

export type CalendarRepository = ReturnType<typeof createCalendarRepository>;
