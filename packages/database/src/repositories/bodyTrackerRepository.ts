/**
 * Repositorio remoto del body tracker: catálogo de medidas corporales
 * (`body_measurements`) y sus entradas registradas (`body_measurement_entries`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;
type MeasurementInsert = Database["public"]["Tables"]["body_measurements"]["Insert"];
type EntryInsert = Database["public"]["Tables"]["body_measurement_entries"]["Insert"];

export function createBodyTrackerRepository(client: Client) {
  return {
    /** Medidas habilitadas primero, luego por `order_index` — orden de visualización en la pantalla de body tracker. */
    getMeasurements() {
      return client
        .from("body_measurements")
        .select("*")
        .order("is_enabled", { ascending: false })
        .order("order_index", { ascending: true });
    },

    /** Actualiza `order_index` de varias medidas en paralelo (una UPDATE por fila, sin transacción). */
    async reorderMeasurements(updates: { id: string; order_index: number }[]) {
      const promises = updates.map(({ id, order_index }) =>
        client.from("body_measurements").update({ order_index }).eq("id", id)
      );
      return Promise.all(promises);
    },

    /** Crea una medida corporal personalizada en `body_measurements`. */
    createMeasurement(data: Omit<MeasurementInsert, "user_id">, userId: string) {
      return client
        .from("body_measurements")
        .insert({ ...data, user_id: userId })
        .select()
        .single();
    },

    /** Actualiza nombre/unidad/visibilidad/objetivo de una medida en `body_measurements`. */
    updateMeasurement(id: string, data: { name?: string; unit?: string; is_enabled?: boolean; goal_type?: string; goal_value?: number | null }) {
      return client
        .from("body_measurements")
        .update(data as Database["public"]["Tables"]["body_measurements"]["Update"])
        .eq("id", id)
        .select()
        .single();
    },

    /** Borra una medida de `body_measurements` (sus entradas en `body_measurement_entries` caen por FK `ON DELETE CASCADE` en Supabase). */
    deleteMeasurement(id: string) {
      return client.from("body_measurements").delete().eq("id", id);
    },

    /** Últimas `limit` entradas de una medida, más recientes primero. */
    getEntries(measurementId: string, limit = 50) {
      return client
        .from("body_measurement_entries")
        .select("*")
        .eq("measurement_id", measurementId)
        .order("recorded_at", { ascending: false })
        .limit(limit);
    },

    /** Todas las entradas del usuario, de todas las medidas, más recientes primero — usado por exportación/gráficas globales. */
    getAllEntries(userId: string) {
      return client
        .from("body_measurement_entries")
        .select("*")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false });
    },

    /** Registra una nueva entrada (valor + fecha) para una medida en `body_measurement_entries`. */
    addEntry(data: Omit<EntryInsert, "user_id">, userId: string) {
      return client
        .from("body_measurement_entries")
        .insert({ ...data, user_id: userId })
        .select()
        .single();
    },

    /** Borra una única entrada de `body_measurement_entries`. */
    deleteEntry(id: string) {
      return client.from("body_measurement_entries").delete().eq("id", id);
    },

    /** Borra TODAS las entradas de una medida (mantiene la medida, resetea su historial). */
    resetMeasurement(measurementId: string) {
      return client
        .from("body_measurement_entries")
        .delete()
        .eq("measurement_id", measurementId);
    },

    /** Si el usuario no tiene ninguna medida aún, siembra "Peso corporal" y "Grasa corporal" por defecto (idempotente vía el `count` inicial). */
    async seedDefaultMeasurementsIfNeeded(userId: string) {
      const { count } = await client
        .from("body_measurements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (count) return { seeded: false };

      const defaults: Omit<MeasurementInsert, "user_id">[] = [
        { name: "Peso corporal", unit: "kg", goal_type: "DECREASE", is_default: true, is_enabled: true, order_index: 0 },
        { name: "Grasa corporal", unit: "%", goal_type: "DECREASE", is_default: true, is_enabled: true, order_index: 1 },
      ];
      const { data, error } = await client
        .from("body_measurements")
        .insert(defaults.map((d) => ({ ...d, user_id: userId })))
        .select();
      return { seeded: !error, data, error };
    },

    /** Exporta todas las entradas de todas las medidas del usuario como CSV (`measurement,value,unit,recorded_at,comment`), con nombre/unidad resueltos y comillas escapadas. Devuelve cadena vacía si no hay entradas. */
    async exportAllCSV(): Promise<string> {
      const { data: measurements } = await client.from("body_measurements").select("id, name, unit");
      const mMap: Record<string, { name: string; unit: string }> = {};
      for (const m of measurements ?? []) mMap[m.id] = { name: m.name, unit: m.unit };

      const { data: entries } = await client
        .from("body_measurement_entries")
        .select("*")
        .order("recorded_at");
      if (!entries?.length) return "";

      const rows = ["measurement,value,unit,recorded_at,comment"];
      for (const e of entries) {
        const m = mMap[e.measurement_id] ?? { name: e.measurement_id, unit: "" };
        rows.push(
          [
            `"${m.name}"`,
            e.value,
            `"${m.unit}"`,
            e.recorded_at,
            `"${(e.comment ?? "").replace(/"/g, '""')}"`,
          ].join(",")
        );
      }
      return rows.join("\n");
    },
  };
}

export type BodyTrackerRepository = ReturnType<typeof createBodyTrackerRepository>;
