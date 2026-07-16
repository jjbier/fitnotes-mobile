/**
 * Cola durable de operaciones pendientes de subir (`pending_ops`, tabla
 * SQLite local): cada escritura offline encola una fila aquí; el `SyncEngine`
 * la procesa en el push y, si falla, la reintenta con backoff exponencial en
 * vez de descartarla.
 */
import type { SqlExecutor } from "../local/sqlExecutor.js";

/** Fila de la cola `pending_ops`: una operación de escritura (insert/update/delete) pendiente de subir a Supabase. */
export interface PendingOpRow {
  id: number;
  table_name: string;
  row_id: string;
  op_type: "insert" | "update" | "delete";
  payload: string | null;
  created_at: string;
  attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
}

const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** Operaciones listas para reintentar ahora (sin backoff pendiente), en orden de creación. */
export async function getDueOps(db: SqlExecutor): Promise<PendingOpRow[]> {
  return db.getAllAsync<PendingOpRow>(
    `SELECT * FROM pending_ops WHERE next_retry_at IS NULL OR next_retry_at <= ? ORDER BY id ASC`,
    [new Date().toISOString()]
  );
}

/** Número total de operaciones en cola (con o sin backoff activo) — usado para el indicador "N cambios sin sincronizar" en la UI. */
export async function getPendingCount(db: SqlExecutor): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM pending_ops`);
  return row?.count ?? 0;
}

/** Retira una operación de la cola tras subirse con éxito. */
export async function markOpSucceeded(db: SqlExecutor, opId: number): Promise<void> {
  await db.runAsync(`DELETE FROM pending_ops WHERE id = ?`, [opId]);
}

/** true si quedan operaciones sin subir para esta fila (p.ej. una edición nueva encolada durante el push). */
export async function hasPendingOpsForRow(
  db: SqlExecutor,
  table: string,
  rowId: string
): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM pending_ops WHERE table_name = ? AND row_id = ?`,
    [table, rowId]
  );
  return (row?.count ?? 0) > 0;
}

/**
 * Registra un intento fallido: incrementa `attempts`, guarda el error y fija
 * `next_retry_at` con backoff exponencial (`BASE_BACKOFF_MS * 2^attempts`,
 * limitado a `MAX_BACKOFF_MS`) para que {@link getDueOps} la ignore hasta entonces.
 */
export async function markOpFailed(
  db: SqlExecutor,
  opId: number,
  attempts: number,
  errorMessage: string
): Promise<void> {
  const backoffMs = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
  const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
  await db.runAsync(
    `UPDATE pending_ops SET attempts = attempts + 1, last_error = ?, next_retry_at = ? WHERE id = ?`,
    [errorMessage, nextRetryAt, opId]
  );
}
