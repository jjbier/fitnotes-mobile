/**
 * Preferencias de usuario — tabla clave/valor local (no forma parte de
 * SYNCABLE_TABLES: es configuración del dispositivo/cuenta, no datos de
 * fitness, así que no pasa por el SyncEngine ni lleva `_dirty`/`_deleted`).
 * Sirve de fallback en modo invitado, donde `user_metadata` no existe.
 */
export const LOCAL_PREFERENCES_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];
