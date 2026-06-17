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

    async createExercise(data: Omit<ExerciseInsert, "user_id">, userId: string) {
      return client
        .from("exercises")
        .insert({ ...data, user_id: userId })
        .select()
        .single();
    },

    async updateExercise(id: string, data: ExerciseUpdate) {
      return client
        .from("exercises")
        .update(data)
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
  };
}

export type ExerciseRepository = ReturnType<typeof createExerciseRepository>;
