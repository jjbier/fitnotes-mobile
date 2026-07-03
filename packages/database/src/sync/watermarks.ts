import type { SqlExecutor } from "../local/sqlExecutor.js";

export async function getWatermark(db: SqlExecutor, table: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ last_pulled_at: string }>(
    `SELECT last_pulled_at FROM sync_watermarks WHERE table_name = ?`,
    [table]
  );
  return row?.last_pulled_at ?? null;
}

export async function setWatermark(db: SqlExecutor, table: string, iso: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_watermarks (table_name, last_pulled_at) VALUES (?, ?)
     ON CONFLICT(table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
    [table, iso]
  );
}
