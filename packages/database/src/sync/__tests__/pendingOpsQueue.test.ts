import { describe, it, expect } from "vitest";
import { createNodeSqlExecutor } from "../../local/testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../local/migrations.js";
import { enqueuePendingOp } from "../../local/pendingOps.js";
import { getDueOps, getPendingCount, markOpFailed, markOpSucceeded } from "../pendingOpsQueue.js";

describe("pendingOpsQueue", () => {
  it("getDueOps returns ops with no next_retry_at, in creation order", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await enqueuePendingOp(db, "workouts", "w1", "insert", { id: "w1" });
    await enqueuePendingOp(db, "workouts", "w2", "insert", { id: "w2" });

    const due = await getDueOps(db);
    expect(due.map((o) => o.row_id)).toEqual(["w1", "w2"]);
  });

  it("markOpSucceeded removes the op from the queue", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await enqueuePendingOp(db, "workouts", "w1", "insert", { id: "w1" });
    const [op] = await getDueOps(db);

    await markOpSucceeded(db, op!.id);
    expect(await getPendingCount(db)).toBe(0);
  });

  it("markOpFailed increments attempts and sets a future next_retry_at, excluding it from getDueOps", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await enqueuePendingOp(db, "workouts", "w1", "insert", { id: "w1" });
    const [op] = await getDueOps(db);

    await markOpFailed(db, op!.id, 0, "network error");

    const stillPending = await getPendingCount(db);
    expect(stillPending).toBe(1);

    const dueNow = await getDueOps(db);
    expect(dueNow).toHaveLength(0); // in backoff, not due yet

    const row = await db.getFirstAsync<{ attempts: number; last_error: string; next_retry_at: string }>(
      "SELECT attempts, last_error, next_retry_at FROM pending_ops WHERE id = ?",
      [op!.id]
    );
    expect(row?.attempts).toBe(1);
    expect(row?.last_error).toBe("network error");
    expect(new Date(row!.next_retry_at).getTime()).toBeGreaterThan(Date.now());
  });
});
