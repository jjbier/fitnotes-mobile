/**
 * Node-backed SqlExecutor implementation for Vitest — lets local repository
 * SQL logic be tested without a real device/expo-sqlite. NOT imported by
 * any production code path (mobile uses expo-sqlite's SQLiteDatabase, which
 * already satisfies the same SqlExecutor shape).
 */
import Database from "better-sqlite3";
import type { SqlExecutor, SqlRunResult } from "../sqlExecutor.js";

export function createNodeSqlExecutor(): SqlExecutor {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");

  return {
    async execAsync(sql) {
      db.exec(sql);
    },

    async runAsync(sql, params = []) {
      const info = db.prepare(sql).run(...params);
      const result: SqlRunResult = { changes: info.changes };
      if (typeof info.lastInsertRowid === "number") {
        result.lastInsertRowId = info.lastInsertRowid;
      }
      return result;
    },

    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },

    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      const row = db.prepare(sql).get(...params);
      return (row as T | undefined) ?? null;
    },

    async withTransactionAsync(fn) {
      db.exec("BEGIN");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}
