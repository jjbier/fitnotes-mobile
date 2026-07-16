/**
 * Repositorio remoto de objetivos de ejercicio (`exercise_goals`). Usa casts
 * `as never` en las queries porque esta tabla no está (o no estaba) reflejada
 * en los tipos generados de Supabase, por lo que cada método remapea las
 * filas manualmente a {@link ExerciseGoalRow}.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;

/** Objetivo de un ejercicio (peso/reps/fecha objetivo), con `achieved_at` marcando si ya se cumplió. */
export interface ExerciseGoalRow {
  id: string;
  exercise_id: string;
  target_weight?: number;
  target_reps?: number;
  target_date?: string;
  notes?: string;
  achieved_at?: string;
  created_at: string;
}

export function createGoalsRepository(client: Client) {
  return {
    /** Todos los objetivos del usuario, más recientes primero. */
    async getGoals(): Promise<ExerciseGoalRow[]> {
      const { data } = await client
        .from("exercise_goals" as never)
        .select("*")
        .order("created_at", { ascending: false }) as { data: Record<string, unknown>[] | null };
      if (!data) return [];
      return data.map((r) => ({
        id: r["id"] as string,
        exercise_id: r["exercise_id"] as string,
        target_weight: r["target_weight"] as number | undefined,
        target_reps: r["target_reps"] as number | undefined,
        target_date: r["target_date"] as string | undefined,
        notes: r["notes"] as string | undefined,
        achieved_at: r["achieved_at"] as string | undefined,
        created_at: r["created_at"] as string,
      }));
    },

    /** Crea o reemplaza el objetivo de un ejercicio (constraint única `user_id,exercise_id` — un solo objetivo activo por ejercicio). */
    async upsertGoal(goal: Omit<ExerciseGoalRow, "id" | "created_at">, userId: string): Promise<ExerciseGoalRow | null> {
      const { data } = await (client
        .from("exercise_goals" as never) as ReturnType<typeof client.from>)
        .upsert({
          user_id: userId,
          exercise_id: goal.exercise_id,
          target_weight: goal.target_weight ?? null,
          target_reps: goal.target_reps ?? null,
          target_date: goal.target_date ?? null,
          notes: goal.notes ?? null,
          achieved_at: goal.achieved_at ?? null,
        } as never, { onConflict: "user_id,exercise_id" })
        .select()
        .single() as { data: Record<string, unknown> | null };
      if (!data) return null;
      return {
        id: data["id"] as string,
        exercise_id: data["exercise_id"] as string,
        target_weight: data["target_weight"] as number | undefined,
        target_reps: data["target_reps"] as number | undefined,
        target_date: data["target_date"] as string | undefined,
        notes: data["notes"] as string | undefined,
        achieved_at: data["achieved_at"] as string | undefined,
        created_at: data["created_at"] as string,
      };
    },

    /** Borra el objetivo de un ejercicio. */
    async deleteGoal(exerciseId: string) {
      return client
        .from("exercise_goals" as never)
        .delete()
        .eq("exercise_id" as never, exerciseId);
    },

    /** Marca el objetivo de un ejercicio como cumplido (`achieved_at = ahora`). */
    async markAchieved(exerciseId: string) {
      return client
        .from("exercise_goals" as never)
        .update({ achieved_at: new Date().toISOString() } as never)
        .eq("exercise_id" as never, exerciseId);
    },
  };
}

export type GoalsRepository = ReturnType<typeof createGoalsRepository>;
