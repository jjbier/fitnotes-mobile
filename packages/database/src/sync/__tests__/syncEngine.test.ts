import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/types.js";
import { createNodeSqlExecutor } from "../../local/testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../local/migrations.js";
import { createLocalWorkoutRepository } from "../../local/repositories/localWorkoutRepository.js";
import { createFakeSupabaseClient } from "../testing/fakeSupabaseClient.js";
import { SyncEngine } from "../syncEngine.js";

function asClient(fake: ReturnType<typeof createFakeSupabaseClient>) {
  return fake as unknown as SupabaseClient<Database>;
}

describe("SyncEngine.pushLocalChanges", () => {
  it("pushes a queued insert to the remote client and clears the local queue", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const repo = createLocalWorkoutRepository(db);
    const { data: workout } = await repo.createWorkout({ date: "2026-07-03" }, "user-1");

    const fake = createFakeSupabaseClient();
    const engine = new SyncEngine(asClient(fake), db);

    const result = await engine.pushLocalChanges();
    expect(result).toEqual({ pushed: 1, failed: 0 });
    expect(fake._db["workouts"]?.[workout!.id]?.date).toBe("2026-07-03");
    expect(await engine.getPendingCount()).toBe(0);
  });

  it("pushes multi-table ops in FK-safe order (workout before workout_exercises)", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const repo = createLocalWorkoutRepository(db);
    const { data: workout } = await repo.createWorkout({ date: "2026-07-03" }, "user-1");
    await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, "user-1");

    const fake = createFakeSupabaseClient();
    const engine = new SyncEngine(asClient(fake), db);
    const result = await engine.pushLocalChanges();

    expect(result.pushed).toBe(2);
    expect(Object.keys(fake._db["workouts"] ?? {})).toHaveLength(1);
    expect(Object.keys(fake._db["workout_exercises"] ?? {})).toHaveLength(1);
  });

  it("clears _dirty on the local row after a successful push, so a later pull can update it again", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const repo = createLocalWorkoutRepository(db);
    const { data: workout } = await repo.createWorkout({ date: "2026-07-03" }, "user-1");

    const fake = createFakeSupabaseClient();
    const engine = new SyncEngine(asClient(fake), db);
    await engine.pushLocalChanges();

    const localRow = await db.getFirstAsync<{ _dirty: number }>(
      "SELECT _dirty FROM workouts WHERE id = ?",
      [workout!.id]
    );
    expect(localRow?._dirty).toBe(0);

    // Simulate another device editing the now-synced row remotely, then this device pulling.
    fake._db["workouts"]![workout!.id]!.comment = "Editado desde otro dispositivo";
    fake._db["workouts"]![workout!.id]!.updated_at = "2026-07-04T00:00:00Z";
    await engine.pullRemoteChanges("user-1");

    const afterPull = await db.getFirstAsync<{ comment: string }>(
      "SELECT comment FROM workouts WHERE id = ?",
      [workout!.id]
    );
    expect(afterPull?.comment).toBe("Editado desde otro dispositivo");
  });

  it("purges the local tombstone after a delete is successfully pushed", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const repo = createLocalWorkoutRepository(db);
    const { data: workout } = await repo.createWorkout({ date: "2026-07-03" }, "user-1");

    const fake = createFakeSupabaseClient();
    const engine = new SyncEngine(asClient(fake), db);
    await engine.pushLocalChanges(); // push the insert first

    await repo.deleteWorkout(workout!.id);
    await engine.pushLocalChanges(); // push the delete

    const row = await db.getFirstAsync("SELECT id FROM workouts WHERE id = ?", [workout!.id]);
    expect(row).toBeNull();
  });

  it("keeps a failed op in the queue with backoff instead of losing it", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const repo = createLocalWorkoutRepository(db);
    await repo.createWorkout({ date: "2026-07-03" }, "user-1");

    const fake = createFakeSupabaseClient();
    fake._failNextOn("workouts");
    const engine = new SyncEngine(asClient(fake), db);

    const result = await engine.pushLocalChanges();
    expect(result).toEqual({ pushed: 0, failed: 1 });
    expect(await engine.getPendingCount()).toBe(1);

    // Retrying immediately should not push it again — it's in backoff.
    const secondAttempt = await engine.pushLocalChanges();
    expect(secondAttempt).toEqual({ pushed: 0, failed: 0 });
  });
});

describe("SyncEngine.pullRemoteChanges", () => {
  it("pulls remote rows into the local db and advances the watermark", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const fake = createFakeSupabaseClient({
      categories: {
        c1: { id: "c1", user_id: "user-1", name: "Pecho", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      },
    });
    const engine = new SyncEngine(asClient(fake), db);

    const result = await engine.pullRemoteChanges("user-1");
    expect(result.pulled).toBe(1);
    expect(result.changedTables.has("categories")).toBe(true);

    const row = await db.getFirstAsync<{ name: string }>("SELECT name FROM categories WHERE id = ?", ["c1"]);
    expect(row?.name).toBe("Pecho");
  });

  it("a second pull with nothing new does not re-report the table as changed", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const fake = createFakeSupabaseClient({
      categories: {
        c1: { id: "c1", user_id: "user-1", name: "Pecho", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      },
    });
    const engine = new SyncEngine(asClient(fake), db);
    await engine.pullRemoteChanges("user-1");

    const second = await engine.pullRemoteChanges("user-1");
    expect(second.pulled).toBe(0);
    expect(second.changedTables.size).toBe(0);
  });

  it("only pulls rows for the given user", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const fake = createFakeSupabaseClient({
      categories: {
        c1: { id: "c1", user_id: "user-1", name: "Mine", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
        c2: { id: "c2", user_id: "user-2", name: "NotMine", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      },
    });
    const engine = new SyncEngine(asClient(fake), db);
    await engine.pullRemoteChanges("user-1");

    const rows = await db.getAllAsync("SELECT id FROM categories");
    expect(rows).toEqual([{ id: "c1" }]);
  });
});

describe("SyncEngine.sync", () => {
  it("pushes before pulling so a local edit isn't clobbered by its own pre-push remote state", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const repo = createLocalWorkoutRepository(db);
    const { data: workout } = await repo.createWorkout({ date: "2026-07-03" }, "user-1");

    const fake = createFakeSupabaseClient();
    const engine = new SyncEngine(asClient(fake), db);

    const result = await engine.sync("user-1");
    expect(result.pushed).toBe(1);
    expect(fake._db["workouts"]?.[workout!.id]).toBeDefined();
  });
});
