import type { SqlExecutor } from "../local/sqlExecutor.js";
import type { SyncableTable } from "../local/schema.js";

function toSqlValue(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === undefined) return null;
  return v;
}

/**
 * Aplica filas remotas (de un pull) a la tabla local correspondiente.
 * Regla de conflicto: una fila local con cambios sin subir (_dirty=1) gana
 * siempre — evita que un pull pise una edición offline aún no sincronizada.
 * Si no está dirty, gana la fila con updated_at más reciente (last-write-wins).
 */
export async function applyRemoteRows(
  db: SqlExecutor,
  table: SyncableTable,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const id = row.id as string;
      const existing = await db.getFirstAsync<{ updated_at: string; _dirty: number }>(
        `SELECT updated_at, _dirty FROM ${table} WHERE id = ?`,
        [id]
      );

      if (existing) {
        if (existing._dirty === 1) continue;
        if (existing.updated_at >= (row.updated_at as string)) continue;
      }

      const columns = Object.keys(row);
      const placeholders = columns.map(() => "?").join(", ");
      const updateClause = columns.map((c) => `${c} = excluded.${c}`).join(", ");
      const values = columns.map((c) => toSqlValue(row[c]));

      await db.runAsync(
        `INSERT INTO ${table} (${columns.join(", ")}, _dirty, _deleted)
         VALUES (${placeholders}, 0, 0)
         ON CONFLICT(id) DO UPDATE SET ${updateClause}, _dirty = 0, _deleted = 0`,
        values
      );
    }
  });
}
