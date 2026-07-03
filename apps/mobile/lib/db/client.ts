import * as SQLite from "expo-sqlite";
import type { SqlExecutor, SqlRunResult } from "@fitnotes/database";
import { runLocalMigrations, serializeExecutor } from "@fitnotes/database";

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

/** Opens (once) the local SQLite DB, runs pending migrations, returns the shared executor. */
export function getLocalDb(): Promise<SqlExecutor> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const raw = await SQLite.openDatabaseAsync("fitnotes.db");
      const executor = serializeExecutor(wrapDatabase(raw));
      await runLocalMigrations(executor);
      return executor;
    })();
  }
  return dbPromise;
}
