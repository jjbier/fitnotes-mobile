import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type RoutineRow = Database["public"]["Tables"]["routines"]["Row"];

type Client = SupabaseClient<Database>;

export function createRoutineRepository(client: Client) {
  return {
    // ─── Routines ──────────────────────────────────────────────────────────────

    async getRoutines() {
      return client
        .from("routines")
        .select("*")
        .order("created_at", { ascending: true });
    },

    async createRoutine(data: { name: string; notes?: string }, userId: string) {
      return client
        .from("routines")
        .insert({ name: data.name, notes: data.notes ?? null, user_id: userId })
        .select()
        .single();
    },

    async updateRoutine(id: string, data: { name?: string; notes?: string }) {
      return client
        .from("routines")
        .update({ name: data.name, notes: data.notes ?? null })
        .eq("id", id)
        .select()
        .single();
    },

    async deleteRoutine(id: string) {
      return client.from("routines").delete().eq("id", id);
    },

    async copyRoutine(sourceId: string, newName: string, userId: string): Promise<{ data: RoutineRow | null; error: PostgrestError | null }> {
      const { data: srcRoutine, error: e0 } = await client
        .from("routines")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (e0 || !srcRoutine) return { data: null, error: e0 };

      const { data: newRoutine, error: e1 } = await client
        .from("routines")
        .insert({ name: newName, notes: srcRoutine.notes, user_id: userId })
        .select()
        .single();
      if (e1 || !newRoutine) return { data: null, error: e1 };

      const { data: days } = await client
        .from("routine_days")
        .select("*")
        .eq("routine_id", sourceId)
        .order("order_index", { ascending: true });

      for (const day of days ?? []) {
        const { data: newDay, error: e2 } = await client
          .from("routine_days")
          .insert({ name: day.name, order_index: day.order_index, routine_id: newRoutine.id, user_id: userId })
          .select()
          .single();
        if (e2 || !newDay) continue;

        const { data: exercises } = await client
          .from("routine_day_exercises")
          .select("*")
          .eq("routine_day_id", day.id)
          .order("order_index", { ascending: true });

        for (const ex of exercises ?? []) {
          const { data: newEx, error: e3 } = await client
            .from("routine_day_exercises")
            .insert({
              routine_day_id: newDay.id,
              exercise_id: ex.exercise_id,
              order_index: ex.order_index,
              group_id: ex.group_id,
              user_id: userId,
            })
            .select()
            .single();
          if (e3 || !newEx) continue;

          const { data: sets } = await client
            .from("predefined_sets")
            .select("*")
            .eq("routine_day_exercise_id", ex.id)
            .order("order_index", { ascending: true });

          if (sets && sets.length > 0) {
            await client.from("predefined_sets").insert(
              sets.map((s) => ({
                routine_day_exercise_id: newEx.id,
                weight: s.weight,
                reps: s.reps,
                distance: s.distance,
                time_seconds: s.time_seconds,
                order_index: s.order_index,
                user_id: userId,
              }))
            );
          }
        }
      }

      return { data: newRoutine, error: null };
    },

    // ─── Routine Days ──────────────────────────────────────────────────────────

    async getDays(routineId: string) {
      return client
        .from("routine_days")
        .select("*")
        .eq("routine_id", routineId)
        .order("order_index", { ascending: true });
    },

    async createDay(
      data: { routine_id: string; name: string; order_index: number },
      userId: string
    ) {
      return client
        .from("routine_days")
        .insert({ ...data, user_id: userId })
        .select()
        .single();
    },

    async updateDay(id: string, data: { name?: string; order_index?: number }) {
      return client
        .from("routine_days")
        .update(data)
        .eq("id", id)
        .select()
        .single();
    },

    async deleteDay(id: string) {
      return client.from("routine_days").delete().eq("id", id);
    },

    // ─── Routine Day Exercises ─────────────────────────────────────────────────

    async getDayExercises(dayId: string) {
      return client
        .from("routine_day_exercises")
        .select("*")
        .eq("routine_day_id", dayId)
        .order("order_index", { ascending: true });
    },

    async addExercise(
      data: {
        routine_day_id: string;
        exercise_id: string;
        order_index: number;
        group_id?: string;
      },
      userId: string
    ) {
      return client
        .from("routine_day_exercises")
        .insert({ ...data, group_id: data.group_id ?? null, user_id: userId })
        .select()
        .single();
    },

    async updateDayExercise(id: string, data: { group_id?: string | null; group_name?: string | null }) {
      return client
        .from("routine_day_exercises")
        .update(data)
        .eq("id", id)
        .select()
        .single();
    },

    async updateDayGroupName(groupId: string, name: string) {
      return client
        .from("routine_day_exercises")
        .update({ group_name: name || null })
        .eq("group_id", groupId);
    },

    async removeExercise(id: string) {
      return client.from("routine_day_exercises").delete().eq("id", id);
    },

    async reorderExercises(updates: { id: string; order_index: number }[]) {
      return Promise.all(
        updates.map(({ id, order_index }) =>
          client.from("routine_day_exercises").update({ order_index }).eq("id", id)
        )
      );
    },

    async reorderDays(updates: { id: string; order_index: number }[]) {
      return Promise.all(
        updates.map(({ id, order_index }) =>
          client.from("routine_days").update({ order_index }).eq("id", id)
        )
      );
    },

    // ─── Predefined Sets ───────────────────────────────────────────────────────

    async getPredefinedSets(routineDayExerciseId: string) {
      return client
        .from("predefined_sets")
        .select("*")
        .eq("routine_day_exercise_id", routineDayExerciseId)
        .order("order_index", { ascending: true });
    },

    async savePredefinedSets(
      routineDayExerciseId: string,
      sets: Array<{
        weight?: number;
        reps?: number;
        distance?: number;
        time_seconds?: number;
        order_index: number;
      }>,
      userId: string
    ) {
      await client
        .from("predefined_sets")
        .delete()
        .eq("routine_day_exercise_id", routineDayExerciseId);
      const rows = sets.map((s) => ({
        routine_day_exercise_id: routineDayExerciseId,
        weight: s.weight ?? null,
        reps: s.reps ?? null,
        distance: s.distance ?? null,
        time_seconds: s.time_seconds ?? null,
        order_index: s.order_index,
        user_id: userId,
      }));
      if (rows.length === 0) return client.from("predefined_sets").select().eq("id", "none");
      return client.from("predefined_sets").insert(rows).select();
    },

    async getRoutineStats(routineIds: string[]): Promise<{
      data: { routineId: string; lastUsed: string | null; sessionCount: number }[];
    }> {
      if (routineIds.length === 0) return { data: [] };

      const [daysRes, weRes] = await Promise.all([
        client.from("routine_days").select("id, routine_id").in("routine_id", routineIds),
        client.from("workout_exercises").select("exercise_id, workout_id"),
      ]);

      const dayToRoutine = new Map((daysRes.data ?? []).map((d) => [d.id, d.routine_id]));
      const dayIds = [...dayToRoutine.keys()];
      if (dayIds.length === 0) return { data: routineIds.map((id) => ({ routineId: id, lastUsed: null, sessionCount: 0 })) };

      const [rdeRes, wRes] = await Promise.all([
        client.from("routine_day_exercises").select("routine_day_id, exercise_id").in("routine_day_id", dayIds),
        client.from("workouts").select("id, date"),
      ]);

      const routineExercises = new Map<string, Set<string>>();
      for (const rde of rdeRes.data ?? []) {
        const routineId = dayToRoutine.get(rde.routine_day_id);
        if (!routineId) continue;
        if (!routineExercises.has(routineId)) routineExercises.set(routineId, new Set());
        routineExercises.get(routineId)!.add(rde.exercise_id);
      }

      const workoutDate = new Map((wRes.data ?? []).map((w) => [w.id, w.date]));

      const data = routineIds.map((routineId) => {
        const exIds = routineExercises.get(routineId);
        if (!exIds || exIds.size === 0) return { routineId, lastUsed: null, sessionCount: 0 };
        const workoutIds = new Set<string>();
        let lastUsed: string | null = null;
        for (const we of weRes.data ?? []) {
          if (exIds.has(we.exercise_id)) {
            workoutIds.add(we.workout_id);
            const date = workoutDate.get(we.workout_id);
            if (date && (!lastUsed || date > lastUsed)) lastUsed = date;
          }
        }
        return { routineId, lastUsed, sessionCount: workoutIds.size };
      });

      return { data };
    },
  };
}

export type RoutineRepository = ReturnType<typeof createRoutineRepository>;
