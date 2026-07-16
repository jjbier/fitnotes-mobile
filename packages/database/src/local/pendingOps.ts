/**
 * Escritura en la cola durable `pending_ops` — el punto único por el que
 * cualquier repo local declara "esto hay que subirlo a Supabase".
 */
import type { SqlExecutor } from "./sqlExecutor.js";
import type { SyncableTable } from "./schema.js";

/** Tipo de operación pendiente, replica el CRUD que originó la fila local. */
export type PendingOpType = "insert" | "update" | "delete";

/**
 * Encola una operación pendiente de subir a Supabase — llamado por los
 * repositorios locales dentro de la MISMA transacción que la escritura local,
 * para garantizar que ninguna escritura queda nunca sin encolar.
 * El motor de sync (Fase 3) es quien lee/procesa esta cola.
 */
export async function enqueuePendingOp(
  db: SqlExecutor,
  table: SyncableTable,
  rowId: string,
  opType: PendingOpType,
  payload: Record<string, unknown> | null
): Promise<void> {
  await db.runAsync(
    `INSERT INTO pending_ops (table_name, row_id, op_type, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [table, rowId, opType, payload ? JSON.stringify(payload) : null, new Date().toISOString()]
  );
}
