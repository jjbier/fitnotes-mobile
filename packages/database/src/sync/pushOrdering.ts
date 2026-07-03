import type { SyncableTable } from "../local/schema.js";

/** Orden seguro de push respetando FKs — padres antes que hijos. */
export const PUSH_ORDER: SyncableTable[] = [
  "categories",
  "exercises",
  "routines",
  "workouts",
  "routine_days",
  "workout_exercises",
  "routine_day_exercises",
  "sets",
  "predefined_sets",
  "personal_records",
  "body_measurements",
  "body_measurement_entries",
  "exercise_goals",
];

/**
 * Ordena una tanda de operaciones pendientes para el push: inserts/updates
 * van padres-primero (evita violar FKs al crear), deletes van hijos-primero
 * (evita violar FKs al borrar). Dentro de la misma tabla se preserva el
 * orden original (Array.sort es estable), que es el orden de creación real.
 */
export function sortPendingOpsForPush<T extends { table_name: string; op_type: string }>(
  ops: T[]
): T[] {
  const priority = new Map(PUSH_ORDER.map((t, i) => [t as string, i]));
  const rank = (table: string) => priority.get(table) ?? PUSH_ORDER.length;

  const nonDeletes = ops
    .filter((o) => o.op_type !== "delete")
    .sort((a, b) => rank(a.table_name) - rank(b.table_name));
  const deletes = ops
    .filter((o) => o.op_type === "delete")
    .sort((a, b) => rank(b.table_name) - rank(a.table_name));

  return [...nonDeletes, ...deletes];
}
