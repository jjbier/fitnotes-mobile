import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;
type MeasurementInsert = Database["public"]["Tables"]["body_measurements"]["Insert"];
type EntryInsert = Database["public"]["Tables"]["body_measurement_entries"]["Insert"];

export function createBodyTrackerRepository(client: Client) {
  return {
    getMeasurements() {
      return client
        .from("body_measurements")
        .select("*")
        .order("is_enabled", { ascending: false })
        .order("name", { ascending: true });
    },

    createMeasurement(data: Omit<MeasurementInsert, "user_id">, userId: string) {
      return client
        .from("body_measurements")
        .insert({ ...data, user_id: userId })
        .select()
        .single();
    },

    updateMeasurement(id: string, data: { name?: string; unit?: string; is_enabled?: boolean; goal_type?: string; goal_value?: number | null }) {
      return client
        .from("body_measurements")
        .update(data as Database["public"]["Tables"]["body_measurements"]["Update"])
        .eq("id", id)
        .select()
        .single();
    },

    deleteMeasurement(id: string) {
      return client.from("body_measurements").delete().eq("id", id);
    },

    getEntries(measurementId: string, limit = 50) {
      return client
        .from("body_measurement_entries")
        .select("*")
        .eq("measurement_id", measurementId)
        .order("recorded_at", { ascending: false })
        .limit(limit);
    },

    getAllEntries(userId: string) {
      return client
        .from("body_measurement_entries")
        .select("*")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false });
    },

    addEntry(data: Omit<EntryInsert, "user_id">, userId: string) {
      return client
        .from("body_measurement_entries")
        .insert({ ...data, user_id: userId })
        .select()
        .single();
    },

    deleteEntry(id: string) {
      return client.from("body_measurement_entries").delete().eq("id", id);
    },

    resetMeasurement(measurementId: string) {
      return client
        .from("body_measurement_entries")
        .delete()
        .eq("measurement_id", measurementId);
    },
  };
}

export type BodyTrackerRepository = ReturnType<typeof createBodyTrackerRepository>;
