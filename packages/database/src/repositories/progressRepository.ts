import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;

export interface ChartPoint {
  date: string;
  maxWeight: number;
  totalVolume: number;
  maxReps: number;
}

export function createProgressRepository(client: Client) {
  return {
    getPersonalRecords(exerciseId: string) {
      return client
        .from("personal_records")
        .select("*")
        .eq("exercise_id", exerciseId)
        .order("reps", { ascending: true })
        .order("weight", { ascending: false });
    },

    getAllPersonalRecords() {
      return client
        .from("personal_records")
        .select("*")
        .order("exercise_id")
        .order("reps", { ascending: true })
        .order("weight", { ascending: false });
    },

    async getChartData(exerciseId: string): Promise<ChartPoint[]> {
      // Fetch workout_exercises for this exercise, with their parent workout dates
      const { data: weRows, error } = await client
        .from("workout_exercises")
        .select("id, workouts!inner(date)")
        .eq("exercise_id", exerciseId);

      if (error || !weRows || weRows.length === 0) return [];

      type WeRow = (typeof weRows)[number] & { workouts: { date: string } };

      const dateByWeId: Record<string, string> = {};
      for (const we of weRows as WeRow[]) {
        dateByWeId[we.id] = we.workouts.date;
      }

      const weIds = weRows.map((we) => we.id);
      const { data: setRows } = await client
        .from("sets")
        .select("workout_exercise_id, weight, reps, is_complete")
        .in("workout_exercise_id", weIds)
        .eq("is_complete", true);

      if (!setRows || setRows.length === 0) return [];

      const byDate: Record<string, { maxWeight: number; totalVolume: number; maxReps: number }> = {};

      for (const s of setRows) {
        const date = dateByWeId[s.workout_exercise_id];
        if (!date) continue;
        const w = s.weight ?? 0;
        const r = s.reps ?? 0;
        if (!byDate[date]) byDate[date] = { maxWeight: 0, totalVolume: 0, maxReps: 0 };
        const entry = byDate[date]!;
        if (w > entry.maxWeight) entry.maxWeight = w;
        entry.totalVolume += w * r;
        if (r > entry.maxReps) entry.maxReps = r;
      }

      return Object.entries(byDate)
        .map(([date, vals]) => ({ date, ...vals }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

export type ProgressRepository = ReturnType<typeof createProgressRepository>;
