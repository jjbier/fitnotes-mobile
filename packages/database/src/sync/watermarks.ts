/**
 * Marcas de agua de sincronización por tabla (`sync_watermarks`): guardan el
 * `updated_at` más reciente ya traído en un pull, para que el siguiente pull
 * solo pida filas remotas posteriores a esa marca (pull incremental).
 */
import type { SqlExecutor } from "../local/sqlExecutor.js";

/** Marca de agua actual de una tabla, o `null` si nunca se hizo pull (pull completo la próxima vez). */
export async function getWatermark(db: SqlExecutor, table: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ last_pulled_at: string }>(
    `SELECT last_pulled_at FROM sync_watermarks WHERE table_name = ?`,
    [table]
  );
  return row?.last_pulled_at ?? null;
}

/** Actualiza (o crea) la marca de agua de una tabla tras aplicar un pull. */
export async function setWatermark(db: SqlExecutor, table: string, iso: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_watermarks (table_name, last_pulled_at) VALUES (?, ?)
     ON CONFLICT(table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
    [table, iso]
  );
}
