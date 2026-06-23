import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;
type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];
type CategoryUpdate = Database["public"]["Tables"]["categories"]["Update"];
type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];
type ExerciseUpdate = Database["public"]["Tables"]["exercises"]["Update"];

// Supabase row → domain Category (strips user_id, updated_at)
export interface CategoryDomain {
  id: string;
  name: string;
  color: string;
  order_index: number;
}

// Supabase row → domain Exercise (normalises nullable fields)
export interface ExerciseDomain {
  id: string;
  name: string;
  category_id: string;
  type: string;
  weight_unit: string;
  notes?: string;
  is_favorite: boolean;
  created_at: string;
}

export function createExerciseRepository(client: Client) {
  return {
    // ─── Categories ────────────────────────────────────────────────────────────

    async getCategories() {
      return client
        .from("categories")
        .select("*")
        .order("order_index", { ascending: true });
    },

    async createCategory(data: Omit<CategoryInsert, "user_id">, userId: string) {
      return client
        .from("categories")
        .insert({ ...data, user_id: userId })
        .select()
        .single();
    },

    async updateCategory(id: string, data: CategoryUpdate) {
      return client
        .from("categories")
        .update(data)
        .eq("id", id)
        .select()
        .single();
    },

    async deleteCategory(id: string) {
      return client.from("categories").delete().eq("id", id);
    },

    async reorderCategories(updates: { id: string; order_index: number }[]) {
      const promises = updates.map(({ id, order_index }) =>
        client.from("categories").update({ order_index }).eq("id", id)
      );
      return Promise.all(promises);
    },

    // ─── Exercises ─────────────────────────────────────────────────────────────

    async getExercises(categoryId?: string) {
      let query = client
        .from("exercises")
        .select("*")
        .order("name", { ascending: true });
      if (categoryId) query = query.eq("category_id", categoryId);
      return query;
    },

    async createExercise(
      data: Omit<ExerciseInsert, "user_id" | "type"> & { type: string; notes?: string | null },
      userId: string
    ) {
      return client
        .from("exercises")
        .insert({ ...(data as unknown as ExerciseInsert), user_id: userId })
        .select()
        .single();
    },

    async updateExercise(id: string, data: Omit<ExerciseUpdate, "type"> & { type?: string; notes?: string | null }) {
      return client
        .from("exercises")
        .update(data as unknown as ExerciseUpdate)
        .eq("id", id)
        .select()
        .single();
    },

    async deleteExercise(id: string) {
      return client.from("exercises").delete().eq("id", id);
    },

    async toggleFavorite(id: string, isFavorite: boolean) {
      return client
        .from("exercises")
        .update({ is_favorite: isFavorite })
        .eq("id", id)
        .select()
        .single();
    },

    async getExerciseHistory(exerciseId: string): Promise<{
      data: {
        workout_id: string;
        date: string;
        comment?: string;
        sets: {
          id: string;
          weight?: number;
          reps?: number;
          distance?: number;
          time_seconds?: number;
          is_complete: boolean;
          comment?: string;
          order_index: number;
        }[];
      }[] | null;
      error: { message: string } | null;
    }> {
      const weRes = await client
        .from("workout_exercises")
        .select("id, workout_id")
        .eq("exercise_id", exerciseId);
      if (weRes.error) return { data: null, error: weRes.error };
      if (weRes.data.length === 0) return { data: [], error: null };

      const weIds = weRes.data.map((we) => we.id);
      const workoutIds = [...new Set(weRes.data.map((we) => we.workout_id))];

      const [wRes, sRes] = await Promise.all([
        client.from("workouts").select("id, date, comment").in("id", workoutIds),
        client.from("sets")
          .select("id, workout_exercise_id, weight, reps, distance, time_seconds, is_complete, comment, order_index")
          .in("workout_exercise_id", weIds),
      ]);
      if (wRes.error) return { data: null, error: wRes.error };
      if (sRes.error) return { data: null, error: sRes.error };

      const workoutMap = new Map(wRes.data.map((w) => [w.id, w]));
      const setsByWE = new Map<string, typeof sRes.data>();
      for (const s of sRes.data) {
        if (!setsByWE.has(s.workout_exercise_id)) setsByWE.set(s.workout_exercise_id, []);
        setsByWE.get(s.workout_exercise_id)!.push(s);
      }

      const built: { workout_id: string; date: string; comment?: string; sets: { id: string; weight?: number; reps?: number; distance?: number; time_seconds?: number; is_complete: boolean; comment?: string; order_index: number }[] }[] = [];
      for (const we of weRes.data) {
        const workout = workoutMap.get(we.workout_id);
        if (!workout) continue;
        const sets = (setsByWE.get(we.id) ?? [])
          .sort((a, b) => a.order_index - b.order_index)
          .map((s) => ({
            id: s.id,
            weight: s.weight ?? undefined,
            reps: s.reps ?? undefined,
            distance: s.distance ?? undefined,
            time_seconds: s.time_seconds ?? undefined,
            is_complete: s.is_complete,
            comment: s.comment ?? undefined,
            order_index: s.order_index,
          }));
        built.push({ workout_id: we.workout_id, date: workout.date, comment: workout.comment ?? undefined, sets });
      }
      const sessions = built.sort((a, b) => b.date.localeCompare(a.date));

      return { data: sessions, error: null };
    },

    async convertExerciseWeights(exerciseId: string, factor: number): Promise<{ error: { message: string } | null }> {
      const weRes = await client.from("workout_exercises").select("id").eq("exercise_id", exerciseId);
      if (weRes.error) return { error: weRes.error };
      if (weRes.data.length === 0) return { error: null };

      const weIds = weRes.data.map((we) => we.id);
      const setsRes = await client
        .from("sets")
        .select("id, weight")
        .in("workout_exercise_id", weIds)
        .not("weight", "is", null);
      if (setsRes.error) return { error: setsRes.error };
      if (setsRes.data.length === 0) return { error: null };

      const results = await Promise.all(
        setsRes.data.map((s) =>
          client.from("sets").update({ weight: Math.round(s.weight! * factor * 100) / 100 }).eq("id", s.id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) return { error: failed.error };
      return { error: null };
    },

    async getExerciseStats(): Promise<{
      data: Record<string, { workout_count: number; last_used: string | null }> | null;
      error: { message: string } | null;
    }> {
      const [weRes, wRes] = await Promise.all([
        client.from("workout_exercises").select("exercise_id, workout_id"),
        client.from("workouts").select("id, date"),
      ]);
      if (weRes.error) return { data: null, error: weRes.error };
      if (wRes.error) return { data: null, error: wRes.error };

      const workoutDateMap = new Map(wRes.data.map((w) => [w.id, w.date]));
      const workoutsByExercise = new Map<string, Set<string>>();
      const lastUsedByExercise = new Map<string, string>();

      for (const we of weRes.data) {
        if (!workoutsByExercise.has(we.exercise_id)) {
          workoutsByExercise.set(we.exercise_id, new Set());
        }
        workoutsByExercise.get(we.exercise_id)!.add(we.workout_id);
        const date = workoutDateMap.get(we.workout_id);
        if (date) {
          const current = lastUsedByExercise.get(we.exercise_id);
          if (!current || date > current) lastUsedByExercise.set(we.exercise_id, date);
        }
      }

      const stats: Record<string, { workout_count: number; last_used: string | null }> = {};
      for (const [exerciseId, workoutIds] of workoutsByExercise) {
        stats[exerciseId] = {
          workout_count: workoutIds.size,
          last_used: lastUsedByExercise.get(exerciseId) ?? null,
        };
      }
      return { data: stats, error: null };
    },
  };
}

export type ExerciseRepository = ReturnType<typeof createExerciseRepository>;
