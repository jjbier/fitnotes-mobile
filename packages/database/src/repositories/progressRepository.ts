import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;

export interface ChartPoint {
  date: string;
  maxWeight: number;
  totalVolume: number;
  maxReps: number;
  est1RM: number;
  maxDistance: number;
  maxTime: number;
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

    // Returns best completed set stats per exercise for exercises that lack PRs (e.g. reps-only)
    async getBestSetsByExercise(exerciseIds: string[]): Promise<Record<string, { maxReps: number; maxDistance: number; maxTime: number }>> {
      if (exerciseIds.length === 0) return {};
      const { data } = await client
        .from("workout_exercises")
        .select("exercise_id, sets(reps, distance, time_seconds, is_complete, is_warmup)")
        .in("exercise_id", exerciseIds);
      const result: Record<string, { maxReps: number; maxDistance: number; maxTime: number }> = {};
      if (!data) return result;
      for (const we of data) {
        const exId = we.exercise_id;
        const wesets = (we.sets as Array<{ reps: number | null; distance: number | null; time_seconds: number | null; is_complete: boolean; is_warmup: boolean | null }> | null) ?? [];
        for (const s of wesets) {
          if (!s.is_complete || s.is_warmup) continue;
          if (!result[exId]) result[exId] = { maxReps: 0, maxDistance: 0, maxTime: 0 };
          if ((s.reps ?? 0) > result[exId]!.maxReps) result[exId]!.maxReps = s.reps ?? 0;
          if ((s.distance ?? 0) > result[exId]!.maxDistance) result[exId]!.maxDistance = s.distance ?? 0;
          if ((s.time_seconds ?? 0) > result[exId]!.maxTime) result[exId]!.maxTime = s.time_seconds ?? 0;
        }
      }
      return result;
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
        .select("workout_exercise_id, weight, reps, distance, time_seconds, is_complete")
        .in("workout_exercise_id", weIds)
        .eq("is_complete", true)
        .eq("is_warmup", false);

      if (!setRows || setRows.length === 0) return [];

      const byDate: Record<string, { maxWeight: number; totalVolume: number; maxReps: number; est1RM: number; maxDistance: number; maxTime: number }> = {};

      for (const s of setRows) {
        const date = dateByWeId[s.workout_exercise_id];
        if (!date) continue;
        const w = s.weight ?? 0;
        const r = s.reps ?? 0;
        const dist = s.distance ?? 0;
        const time = s.time_seconds ?? 0;
        if (!byDate[date]) byDate[date] = { maxWeight: 0, totalVolume: 0, maxReps: 0, est1RM: 0, maxDistance: 0, maxTime: 0 };
        const entry = byDate[date]!;
        if (w > entry.maxWeight) entry.maxWeight = w;
        entry.totalVolume += w * r;
        if (r > entry.maxReps) entry.maxReps = r;
        if (dist > entry.maxDistance) entry.maxDistance = dist;
        if (time > entry.maxTime) entry.maxTime = time;
        if (w > 0 && r > 0 && r < 37) {
          const orm = w * (36 / (37 - r));
          if (orm > entry.est1RM) entry.est1RM = orm;
        }
      }

      return Object.entries(byDate)
        .map(([date, vals]) => ({ date, ...vals }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getWeeklyTraining(weekStart: string): Promise<{ exerciseId: string; setCount: number; volume: number }[]> {
      const { data: workouts } = await client
        .from("workouts")
        .select("id")
        .gte("date", weekStart);
      if (!workouts || workouts.length === 0) return [];

      const workoutIds = workouts.map((w) => w.id);
      const { data: weRows } = await client
        .from("workout_exercises")
        .select("id, exercise_id")
        .in("workout_id", workoutIds);
      if (!weRows || weRows.length === 0) return [];

      const weIds = weRows.map((we) => we.id);
      const exIdByWeId: Record<string, string> = Object.fromEntries(weRows.map((we) => [we.id, we.exercise_id]));

      const { data: setRows } = await client
        .from("sets")
        .select("workout_exercise_id, weight, reps")
        .in("workout_exercise_id", weIds)
        .eq("is_complete", true)
        .eq("is_warmup", false);

      const byExercise: Record<string, { setCount: number; volume: number }> = {};
      for (const s of setRows ?? []) {
        const exId = exIdByWeId[s.workout_exercise_id];
        if (!exId) continue;
        if (!byExercise[exId]) byExercise[exId] = { setCount: 0, volume: 0 };
        byExercise[exId]!.setCount++;
        byExercise[exId]!.volume += (s.weight ?? 0) * (s.reps ?? 0);
      }

      return Object.entries(byExercise).map(([exerciseId, vals]) => ({ exerciseId, ...vals }));
    },
  };
}

export type ProgressRepository = ReturnType<typeof createProgressRepository>;
