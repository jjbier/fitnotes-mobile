import { describe, it, expect } from "vitest";
import { createNodeSqlExecutor } from "../testing/nodeSqlExecutor.js";

describe("createNodeSqlExecutor", () => {
  it("supports exec, run, getAll, getFirst and transactions", async () => {
    const db = createNodeSqlExecutor();
    await db.execAsync("CREATE TABLE t (id TEXT PRIMARY KEY, value TEXT)");

    await db.withTransactionAsync(async () => {
      await db.runAsync("INSERT INTO t (id, value) VALUES (?, ?)", ["1", "a"]);
      await db.runAsync("INSERT INTO t (id, value) VALUES (?, ?)", ["2", "b"]);
    });

    const all = await db.getAllAsync<{ id: string; value: string }>(
      "SELECT * FROM t ORDER BY id"
    );
    expect(all).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ]);

    const first = await db.getFirstAsync<{ id: string; value: string }>(
      "SELECT * FROM t WHERE id = ?",
      ["2"]
    );
    expect(first).toEqual({ id: "2", value: "b" });

    const missing = await db.getFirstAsync("SELECT * FROM t WHERE id = ?", ["999"]);
    expect(missing).toBeNull();
  });

  it("rolls back the transaction on error", async () => {
    const db = createNodeSqlExecutor();
    await db.execAsync("CREATE TABLE t (id TEXT PRIMARY KEY)");

    await expect(
      db.withTransactionAsync(async () => {
        await db.runAsync("INSERT INTO t (id) VALUES (?)", ["1"]);
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const all = await db.getAllAsync("SELECT * FROM t");
    expect(all).toEqual([]);
  });
});
