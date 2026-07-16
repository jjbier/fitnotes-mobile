/**
 * Cliente singleton de la base de datos SQLite local del dispositivo.
 *
 * Abre `fitnotes.db` con `expo-sqlite`, aplica las migraciones locales
 * pendientes y expone un único `SqlExecutor` compartido (vía
 * `serializeExecutor`, de `@fitnotes/database`) que serializa el acceso
 * concurrente. Toda la UI y los repos locales pasan por `getLocalDb()`; nunca
 * abren `expo-sqlite` directamente.
 */
import * as SQLite from "expo-sqlite";
import type { SqlExecutor, SqlRunResult } from "@fitnotes/database";
import { runLocalMigrations, serializeExecutor } from "@fitnotes/database";

/** Adapta la API nativa de `expo-sqlite` (`SQLite.SQLiteDatabase`) a la interfaz `SqlExecutor` que consume `@fitnotes/database`. */
function wrapDatabase(db: SQLite.SQLiteDatabase): SqlExecutor {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: async (sql, params = []) => {
      const result = await db.runAsync(sql, params as SQLite.SQLiteBindParams);
      const out: SqlRunResult = { changes: result.changes };
      if (typeof result.lastInsertRowId === "number") {
        out.lastInsertRowId = result.lastInsertRowId;
      }
      return out;
    },
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, params as SQLite.SQLiteBindParams),
    getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, params as SQLite.SQLiteBindParams),
    withTransactionAsync: (fn) => db.withTransactionAsync(fn),
  };
}

let dbPromise: Promise<SqlExecutor> | null = null;
let rawDb: SQLite.SQLiteDatabase | null = null;

/** Opens (once) the local SQLite DB, runs pending migrations, returns the shared executor. */
export function getLocalDb(): Promise<SqlExecutor> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const raw = await SQLite.openDatabaseAsync("fitnotes.db");
      rawDb = raw;
      const executor = serializeExecutor(wrapDatabase(raw));
      await runLocalMigrations(executor);
      return executor;
    })();
  }
  return dbPromise;
}

/**
 * Cierra y borra por completo la DB local (sign-out o cambio directo entre
 * dos cuentas reales) y la vuelve a abrir vacía con las migraciones ya
 * aplicadas — evita que la siguiente identidad (invitado nuevo u otra cuenta)
 * vea datos cacheados de la anterior.
 */
export async function resetLocalDb(): Promise<SqlExecutor> {
  await getLocalDb();
  if (rawDb) {
    await rawDb.closeAsync();
    rawDb = null;
  }
  await SQLite.deleteDatabaseAsync("fitnotes.db");
  dbPromise = null;
  return getLocalDb();
}
