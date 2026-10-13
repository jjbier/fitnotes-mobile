import type { SqlExecutor } from "../local/sqlExecutor.js";
import type { SyncableTable } from "../local/schema.js";

/**
 * Pares (tabla, columna FK) cuyo valor puede reescribirse localmente después
 * de que ya exista un `pending_op` sin enviar para esa misma fila — hoy solo
 * ocurre vía `mergeDuplicateCatalogEntries`, que reescribe estas columnas al
 * fusionar duplicados de catálogo, pero cualquier futura reescritura de FK
 * queda cubierta igual sin tocar este fichero.
 */
const STALE_FK_TARGETS: Array<{ table: SyncableTable; field: string }> = [
  { table: "exercises", field: "category_id" },
  { table: "workout_exercises", field: "exercise_id" },
  { table: "routine_day_exercises", field: "exercise_id" },
  { table: "personal_records", field: "exercise_id" },
  { table: "exercise_goals", field: "exercise_id" },
  { table: "body_measurement_entries", field: "measurement_id" },
];

/**
 * El payload de un `pending_op` es una foto fija tomada al encolarlo — si la
 * fila cambia localmente después (p.ej. `mergeDuplicateCatalogEntries`
 * reescribe `category_id`/`exercise_id`/`measurement_id` de una fila que
 * todavía tenía un insert/update sin subir), ese payload congelado sigue
 * apuntando al valor antiguo. Si el valor antiguo deja de existir en remoto
 * (p.ej. la fila duplicada de la que venía ya se tombstonó y su delete se
 * subió con éxito), el insert/update congelado viola la FK correspondiente
 * de forma permanente — ni el backoff ni ningún reintento posterior lo
 * arreglan solos, porque el payload nunca cambia por sí mismo.
 *
 * Recorre cada `pending_op` sin enviar de las tablas/columnas listadas en
 * {@link STALE_FK_TARGETS} y, si su valor difiere del valor actual de esa
 * misma columna en la fila local viva, lo actualiza en sitio — sin tocar
 * `op_type` (sigue siendo `insert` o `update`, lo que ya fuera). Solo importa
 * el estado final de la fila al subirla, así que igualar el payload al valor
 * local vivo actual es siempre seguro, haya o no más de un pending_op en
 * cola para la misma fila.
 */
export async function repairStalePendingPayloads(db: SqlExecutor): Promise<number> {
  let repaired = 0;
  for (const { table, field } of STALE_FK_TARGETS) {
    const ops = await db.getAllAsync<{ id: number; row_id: string; payload: string | null }>(
      `SELECT id, row_id, payload FROM pending_ops WHERE table_name = ? AND payload IS NOT NULL`,
      [table]
    );
    for (const op of ops) {
      const data = JSON.parse(op.payload!) as Record<string, unknown>;
      if (!(field in data)) continue;

      const live = await db.getFirstAsync<Record<string, unknown>>(
        `SELECT ${field} as value FROM ${table} WHERE id = ? AND _deleted = 0`,
        [op.row_id]
      );
      if (!live) continue; // la fila ya no existe localmente — otro camino se encarga de su pending_op

      const liveValue = live.value ?? null;
      const payloadValue = data[field] ?? null;
      if (liveValue !== payloadValue) {
        data[field] = liveValue;
        await db.runAsync(`UPDATE pending_ops SET payload = ? WHERE id = ?`, [JSON.stringify(data), op.id]);
        repaired++;
      }
    }
  }
  return repaired;
}
