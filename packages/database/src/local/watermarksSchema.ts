/** Marca de agua (última fecha de pull exitoso) por tabla, para el pull incremental. */
export const WATERMARKS_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS sync_watermarks (
    table_name TEXT PRIMARY KEY,
    last_pulled_at TEXT NOT NULL
  )`,
];
