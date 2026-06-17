import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;
type WorkoutInsert = Database["public"]["Tables"]["workouts"]["Insert"];
type WorkoutUpdate = Database["public"]["Tables"]["workouts"]["Update"];
type WorkoutExerciseInsert = Database["public"]["Tables"]["workout_exercises"]["Insert"];
type SetInsert = Database["public"]["Tables"]["sets"]["Insert"];
type SetUpdate = Database["public"]["Tables"]["sets"]["Update"];

export function createWorkoutRepository(client: Client) {
  return {
    // ─── Workouts ──────────────────────────────────────────────────────────────

    async getWorkoutByDate(date: string) {
      return client
        .from("workouts")
        .select("*")
        .eq("date", date)
        .maybeSingle();
    },

    async getWorkouts(limit = 30) {
      return client
        .from("workouts")
        .select("*")
        .order("date", { ascending: false })
        .limit(limit);
    },

    async createWorkout(
      data: { date: string; start_time?: string; comment?: string },
      userId: string
    ) {
      const insert: WorkoutInsert = { ...data, user_id: userId };
      return client.from("workouts").insert(insert).select().single();
    },

    async updateWorkout(
      id: string,
      data: { end_time?: string; duration_minutes?: number; comment?: string }
    ) {
      const update: WorkoutUpdate = data;
      return client.from("workouts").update(update).eq("id", id).select().single();
    },

    async deleteWorkout(id: string) {
      return client.from("workouts").delete().eq("id", id);
    },

    // ─── Workout Exercises ─────────────────────────────────────────────────────

    async getWorkoutExercises(workoutId: string) {
      return client
        .from("workout_exercises")
        .select("*")
        .eq("workout_id", workoutId)
        .order("order_index", { ascending: true });
    },

    async addExercise(
      data: {
        workout_id: string;
        exercise_id: string;
        order_index: number;
        group_id?: string;
      },
      userId: string
    ) {
      const insert: WorkoutExerciseInsert = { ...data, user_id: userId };
      return client.from("workout_exercises").insert(insert).select().single();
    },

    async removeExercise(id: string) {
      return client.from("workout_exercises").delete().eq("id", id);
    },

    async reorderExercises(updates: { id: string; order_index: number }[]) {
      return Promise.all(
        updates.map(({ id, order_index }) =>
          client.from("workout_exercises").update({ order_index }).eq("id", id)
        )
      );
    },

    // ─── Sets ──────────────────────────────────────────────────────────────────

    async getSets(workoutExerciseId: string) {
      return client
        .from("sets")
        .select("*")
        .eq("workout_exercise_id", workoutExerciseId)
        .order("order_index", { ascending: true });
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
    ) {
      const insert: SetInsert = { ...data, user_id: userId };
      return client.from("sets").insert(insert).select().single();
    },

    async updateSet(
      id: string,
      data: {
        weight?: number;
        reps?: number;
        distance?: number;
        time_seconds?: number;
        is_complete?: boolean;
        comment?: string;
      }
    ) {
      const update: SetUpdate = data;
      return client.from("sets").update(update).eq("id", id).select().single();
    },

    async deleteSet(id: string) {
      return client.from("sets").delete().eq("id", id);
    },

    // ─── Share ─────────────────────────────────────────────────────────────────

    async shareWorkout(workoutId: string): Promise<string> {
      const [workoutRes, exercisesRes] = await Promise.all([
        client.from("workouts").select("*").eq("id", workoutId).single(),
        client
          .from("workout_exercises")
          .select("*")
          .eq("workout_id", workoutId)
          .order("order_index", { ascending: true }),
      ]);

      if (!workoutRes.data || !exercisesRes.data) return "";

      const exerciseIds = exercisesRes.data.map((we) => we.exercise_id);
      const [namesRes, setsRes] = await Promise.all([
        client.from("exercises").select("id,name").in("id", exerciseIds),
        client
          .from("sets")
          .select("*")
          .in(
            "workout_exercise_id",
            exercisesRes.data.map((we) => we.id)
          )
          .order("order_index", { ascending: true }),
      ]);

      const nameMap: Record<string, string> = {};
      for (const ex of namesRes.data ?? []) nameMap[ex.id] = ex.name;

      const setsByWE: Record<string, typeof setsRes.data> = {};
      for (const s of setsRes.data ?? []) {
        if (!setsByWE[s.workout_exercise_id]) setsByWE[s.workout_exercise_id] = [];
        setsByWE[s.workout_exercise_id]!.push(s);
      }

      const lines: string[] = [`Workout — ${workoutRes.data.date}`];
      for (const we of exercisesRes.data) {
        const name = nameMap[we.exercise_id] ?? we.exercise_id;
        lines.push(name);
        const weSets = setsByWE[we.id] ?? [];
        weSets.forEach((s, i) => {
          const parts: string[] = [];
          if (s.weight != null && s.reps != null) parts.push(`${s.weight}kg × ${s.reps}`);
          else if (s.reps != null) parts.push(`${s.reps} reps`);
          else if (s.distance != null && s.time_seconds != null)
            parts.push(`${s.distance}m in ${s.time_seconds}s`);
          else if (s.distance != null) parts.push(`${s.distance}m`);
          else if (s.time_seconds != null) parts.push(`${s.time_seconds}s`);
          lines.push(`  Set ${i + 1}: ${parts.join(", ") || "—"}`);
        });
      }
      return lines.join("\n");
    },
  };
}

export type WorkoutRepository = ReturnType<typeof createWorkoutRepository>;
