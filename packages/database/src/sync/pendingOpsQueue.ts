import type { SqlExecutor } from "../local/sqlExecutor.js";

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

export async function getPendingCount(db: SqlExecutor): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM pending_ops`);
  return row?.count ?? 0;
}

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
