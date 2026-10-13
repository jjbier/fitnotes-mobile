import { describe, it, expect } from "vitest";
import { createNodeSqlExecutor } from "../../local/testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../local/migrations.js";
import type { SqlExecutor } from "../../local/sqlExecutor.js";
import { enqueuePendingOp } from "../../local/pendingOps.js";
import { mergeDuplicateCatalogEntries } from "../mergeDuplicateCatalog.js";
import { repairStalePendingPayloads } from "../repairStalePayloads.js";

const USER = "user-1";

async function insertCategory(db: SqlExecutor, id: string, name: string, createdAt: string) {
  await db.runAsync(
    `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
     VALUES (?, ?, ?, '#fff', 0, ?, ?, 0, 0)`,
    [id, USER, name, createdAt, createdAt]
  );
}

async function insertExercise(db: SqlExecutor, id: string, name: string, categoryId: string | null, createdAt: string) {
  await db.runAsync(
    `INSERT INTO exercises (id, user_id, category_id, name, type, weight_unit, is_favorite, created_at, updated_at, _dirty, _deleted)
     VALUES (?, ?, ?, ?, 'weight_reps', 'kg', 0, ?, ?, 0, 0)`,
    [id, USER, categoryId, name, createdAt, createdAt]
  );
}

describe("repairStalePendingPayloads", () => {
  it("patches a pending insert's frozen category_id after mergeDuplicateCatalogEntries repoints the exercise to a canonical category", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await insertCategory(db, "c-old", "Pecho", "2026-01-01T00:00:00Z");
    await insertCategory(db, "c-new", " pecho ", "2026-01-02T00:00:00Z");
    // Un ejercicio creado offline, con su insert todavía sin subir cuando
    // llega la fusión de catálogo — su payload congelado apunta a c-new.
    await insertExercise(db, "e1", "Press banca", "c-new", "2026-01-02T00:00:00Z");
    await enqueuePendingOp(db, "exercises", "e1", "insert", {
      id: "e1",
      user_id: USER,
      category_id: "c-new",
      name: "Press banca",
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });

    await mergeDuplicateCatalogEntries(db, USER);
    // c-new ya se tombstonó y su delete está en cola — el insert de e1 sigue
    // con category_id: "c-new" congelado en su payload si no se repara.

    const repaired = await repairStalePendingPayloads(db);
    expect(repaired).toBe(1);

    const insertOp = await db.getFirstAsync<{ payload: string }>(
      `SELECT payload FROM pending_ops WHERE table_name = 'exercises' AND row_id = 'e1' AND op_type = 'insert'`
    );
    expect(insertOp).not.toBeNull();
    const payload = JSON.parse(insertOp!.payload) as Record<string, unknown>;
    expect(payload.category_id).toBe("c-old");
  });

  it("is a no-op when no pending payload has gone stale", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await insertCategory(db, "c1", "Pecho", "2026-01-01T00:00:00Z");
    await insertExercise(db, "e1", "Press banca", "c1", "2026-01-01T00:00:00Z");
    await enqueuePendingOp(db, "exercises", "e1", "insert", {
      id: "e1",
      category_id: "c1",
      name: "Press banca",
    });

    const repaired = await repairStalePendingPayloads(db);
    expect(repaired).toBe(0);
  });

  it("leaves a pending op untouched when its row no longer exists locally", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await enqueuePendingOp(db, "exercises", "ghost", "insert", {
      id: "ghost",
      category_id: "does-not-exist",
      name: "Fantasma",
    });

    const repaired = await repairStalePendingPayloads(db);
    expect(repaired).toBe(0);
  });
});
