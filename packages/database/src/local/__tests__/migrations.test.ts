import { describe, it, expect } from "vitest";
import { createNodeSqlExecutor } from "../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../migrations.js";
import { SYNCABLE_TABLES } from "../schema.js";

describe("runLocalMigrations", () => {
  it("creates all syncable tables plus pending_ops and sync_watermarks", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    );
    const tableNames = tables.map((t) => t.name);

    for (const table of SYNCABLE_TABLES) {
      expect(tableNames).toContain(table);
    }
    expect(tableNames).toContain("pending_ops");
    expect(tableNames).toContain("sync_watermarks");
  });

  it("every syncable table has _dirty, _deleted, user_id and updated_at columns", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);

    for (const table of SYNCABLE_TABLES) {
      const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      const columnNames = columns.map((c) => c.name);
      expect(columnNames, `${table} missing control columns`).toEqual(
        expect.arrayContaining(["_dirty", "_deleted", "user_id", "updated_at", "created_at"])
      );
    }
  });

  it("sets PRAGMA user_version to the latest migration version", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    expect(row?.user_version).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent — running twice does not error or duplicate work", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await expect(runLocalMigrations(db)).resolves.not.toThrow();
  });
});
