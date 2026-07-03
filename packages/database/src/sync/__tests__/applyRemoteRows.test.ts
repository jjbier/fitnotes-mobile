import { describe, it, expect } from "vitest";
import { createNodeSqlExecutor } from "../../local/testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../local/migrations.js";
import { applyRemoteRows } from "../applyRemoteRows.js";

describe("applyRemoteRows", () => {
  it("inserts new rows not yet present locally", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);

    await applyRemoteRows(db, "categories", [
      { id: "c1", user_id: "u1", name: "Pecho", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    ]);

    const row = await db.getFirstAsync<{ name: string }>("SELECT name FROM categories WHERE id = ?", ["c1"]);
    expect(row?.name).toBe("Pecho");
  });

  it("overwrites a local row when remote updated_at is newer and local is not dirty", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await db.runAsync(
      `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
       VALUES ('c1','u1','Old','#000',0,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0)`
    );

    await applyRemoteRows(db, "categories", [
      { id: "c1", user_id: "u1", name: "New", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
    ]);

    const row = await db.getFirstAsync<{ name: string }>("SELECT name FROM categories WHERE id = ?", ["c1"]);
    expect(row?.name).toBe("New");
  });

  it("does NOT overwrite a local row that is dirty (unpushed local edit wins)", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await db.runAsync(
      `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
       VALUES ('c1','u1','LocalEdit','#000',0,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',1,0)`
    );

    await applyRemoteRows(db, "categories", [
      { id: "c1", user_id: "u1", name: "RemoteNewer", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-05T00:00:00Z" },
    ]);

    const row = await db.getFirstAsync<{ name: string; _dirty: number }>(
      "SELECT name, _dirty FROM categories WHERE id = ?",
      ["c1"]
    );
    expect(row?.name).toBe("LocalEdit");
    expect(row?._dirty).toBe(1);
  });

  it("does NOT overwrite when local updated_at is already at least as new (stale remote row)", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await db.runAsync(
      `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
       VALUES ('c1','u1','Current','#000',0,'2026-01-01T00:00:00Z','2026-01-10T00:00:00Z',0,0)`
    );

    await applyRemoteRows(db, "categories", [
      { id: "c1", user_id: "u1", name: "Stale", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
    ]);

    const row = await db.getFirstAsync<{ name: string }>("SELECT name FROM categories WHERE id = ?", ["c1"]);
    expect(row?.name).toBe("Current");
  });

  it("converts boolean fields to 0/1 for SQLite", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);

    await applyRemoteRows(db, "sets", [
      {
        id: "s1", user_id: "u1", workout_exercise_id: "we1", order_index: 0,
        weight: 50, reps: 10, distance: null, time_seconds: null,
        is_complete: true, is_warmup: false, comment: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      },
    ]);

    const row = await db.getFirstAsync<{ is_complete: number; is_warmup: number }>(
      "SELECT is_complete, is_warmup FROM sets WHERE id = ?",
      ["s1"]
    );
    expect(row?.is_complete).toBe(1);
    expect(row?.is_warmup).toBe(0);
  });
});
