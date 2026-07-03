/**
 * Cola durable de operaciones pendientes de subir a Supabase — reemplaza el
 * array en memoria + fichero JSON usado antes (apps/mobile/lib/sync.ts).
 */
export const PENDING_OPS_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS pending_ops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    op_type TEXT NOT NULL CHECK(op_type IN ('insert','update','delete')),
    payload TEXT,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_retry_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pending_ops_table ON pending_ops(table_name)`,
];
