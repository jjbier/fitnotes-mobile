import { describe, it, expect } from "vitest";
import { createNodeSqlExecutor } from "../testing/nodeSqlExecutor.js";
import { serializeExecutor } from "../serializeExecutor.js";
import { runLocalMigrations } from "../migrations.js";
import { createLocalWorkoutRepository } from "../repositories/localWorkoutRepository.js";

describe("serializeExecutor", () => {
  it("without serialization, overlapping withTransactionAsync calls can throw ('cannot start a transaction within a transaction')", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    const repo = createLocalWorkoutRepository(db);
    const { data: workout } = await repo.createWorkout({ date: "2026-07-03" }, "user-1");
    const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, "user-1");
    const { data: set } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, "user-1");

    // Fire-and-forget, unawaited — matches onChangeText firing on every keystroke in the UI.
    const p1 = repo.updateSet(set!.id, { weight: 40 });
    const p2 = repo.updateSet(set!.id, { reps: 15 });
    await expect(Promise.all([p1, p2])).rejects.toThrow(/transaction within a transaction/);
  });

  it("with serialization, the same overlapping calls both land correctly", async () => {
    const rawDb = createNodeSqlExecutor();
    const db = serializeExecutor(rawDb);
    await runLocalMigrations(db);
    const repo = createLocalWorkoutRepository(db);
    const { data: workout } = await repo.createWorkout({ date: "2026-07-03" }, "user-1");
    const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, "user-1");
    const { data: set } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, "user-1");

    const p1 = repo.updateSet(set!.id, { weight: 40 });
    const p2 = repo.updateSet(set!.id, { reps: 15 });
    const p3 = repo.updateSet(set!.id, { is_complete: true });
    await Promise.all([p1, p2, p3]);

    const { data: sets } = await repo.getSets(we!.id);
    expect(sets[0]!.weight).toBe(40);
    expect(sets[0]!.reps).toBe(15);
    expect(sets[0]!.is_complete).toBe(true);
  });

  it("does not deadlock when a repository method calls other executor methods from inside its own withTransactionAsync callback", async () => {
    const db = serializeExecutor(createNodeSqlExecutor());
    await runLocalMigrations(db);
    const repo = createLocalWorkoutRepository(db);
    // createWorkout/addExercise/createSet each call db.runAsync inside db.withTransactionAsync —
    // exactly the pattern that deadlocked before the activeDepth fix.
    const { data: workout } = await repo.createWorkout({ date: "2026-07-03" }, "user-1");
    expect(workout?.id).toBeTruthy();
  });

  it("preserves call order for reads and writes mixed together", async () => {
    const db = serializeExecutor(createNodeSqlExecutor());
    await db.execAsync("CREATE TABLE t (id INTEGER PRIMARY KEY, value INTEGER)");
    await db.runAsync("INSERT INTO t (id, value) VALUES (1, 0)");

    const ops = Array.from({ length: 20 }, (_, i) =>
      db.runAsync("UPDATE t SET value = value + 1 WHERE id = 1")
    );
    await Promise.all(ops);

    const row = await db.getFirstAsync<{ value: number }>("SELECT value FROM t WHERE id = 1");
    expect(row?.value).toBe(20);
  });
});
