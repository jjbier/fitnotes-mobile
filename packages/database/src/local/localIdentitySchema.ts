/**
 * Identidad local del dispositivo — invitado (sin cuenta) o cuenta real vinculada.
 * Tabla singleton (una única fila, id fijo) que resuelve qué `user_id` deben usar
 * los repos locales en cada escritura, y si el SyncEngine debe intentar sincronizar.
 */
export const LOCAL_IDENTITY_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS local_identity (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_user_id TEXT NOT NULL,
    is_guest INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
];
