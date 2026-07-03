import { describe, it, expect } from "vitest";
import { createNodeSqlExecutor } from "../../local/testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../local/migrations.js";
import { enqueuePendingOp } from "../../local/pendingOps.js";
import { claimGuestIdentity } from "../claimGuestData.js";

const GUEST = "guest-uuid";
const REAL = "real-auth-uuid";

describe("claimGuestIdentity", () => {
  it("rewrites user_id across every syncable table that has guest rows", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await db.runAsync(
      `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
       VALUES ('c1', ?, 'Pecho', '#fff', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1, 0)`,
      [GUEST]
    );
    await db.runAsync(
      `INSERT INTO workouts (id, user_id, date, created_at, updated_at, _dirty, _deleted)
       VALUES ('w1', ?, '2026-01-01', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1, 0)`,
      [GUEST]
    );

    await claimGuestIdentity(db, { guestUserId: GUEST, realUserId: REAL });

    const category = await db.getFirstAsync<{ user_id: string }>(`SELECT user_id FROM categories WHERE id = 'c1'`);
    const workout = await db.getFirstAsync<{ user_id: string }>(`SELECT user_id FROM workouts WHERE id = 'w1'`);
    expect(category?.user_id).toBe(REAL);
    expect(workout?.user_id).toBe(REAL);
  });

  it("rewrites user_id embedded in pending_ops insert payloads", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await enqueuePendingOp(db, "categories", "c1", "insert", {
      id: "c1",
      user_id: GUEST,
      name: "Pecho",
      color: "#fff",
      order_index: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    await claimGuestIdentity(db, { guestUserId: GUEST, realUserId: REAL });

    const op = await db.getFirstAsync<{ payload: string }>(`SELECT payload FROM pending_ops WHERE row_id = 'c1'`);
    const payload = JSON.parse(op!.payload) as Record<string, unknown>;
    expect(payload.user_id).toBe(REAL);
  });

  it("leaves update-type payloads without a user_id field untouched", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await enqueuePendingOp(db, "categories", "c1", "update", {
      name: "Espalda",
      updated_at: "2026-01-02T00:00:00Z",
    });

    await claimGuestIdentity(db, { guestUserId: GUEST, realUserId: REAL });

    const op = await db.getFirstAsync<{ payload: string }>(`SELECT payload FROM pending_ops WHERE row_id = 'c1'`);
    const payload = JSON.parse(op!.payload) as Record<string, unknown>;
    expect(payload).toEqual({ name: "Espalda", updated_at: "2026-01-02T00:00:00Z" });
  });

  it("does not touch rows belonging to a different user_id", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await db.runAsync(
      `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
       VALUES ('c2', 'someone-else', 'Piernas', '#000', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 0, 0)`
    );

    await claimGuestIdentity(db, { guestUserId: GUEST, realUserId: REAL });

    const category = await db.getFirstAsync<{ user_id: string }>(`SELECT user_id FROM categories WHERE id = 'c2'`);
    expect(category?.user_id).toBe("someone-else");
  });
});
