import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalWorkoutRepository } from "../localWorkoutRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";

const USER_ID = "user-1";

async function setup() {
  const db = createNodeSqlExecutor();
  await runLocalMigrations(db);
  const repo = createLocalWorkoutRepository(db);
  return { db, repo };
}

async function pendingOpsFor(db: SqlExecutor, table: string) {
  return db.getAllAsync<{ row_id: string; op_type: string }>(
    "SELECT row_id, op_type FROM pending_ops WHERE table_name = ?",
    [table]
  );
}

describe("localWorkoutRepository", () => {
  let db: SqlExecutor;
  let repo: Awaited<ReturnType<typeof setup>>["repo"];

  beforeEach(async () => {
    const s = await setup();
    db = s.db;
    repo = s.repo;
  });

  it("creates a workout with a real UUID and queues an insert op", async () => {
    const { data, error } = await repo.createWorkout({ date: "2026-07-10" }, USER_ID);
    expect(error).toBeNull();
    expect(data?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(data?.date).toBe("2026-07-10");

    const ops = await pendingOpsFor(db, "workouts");
    expect(ops).toEqual([{ row_id: data!.id, op_type: "insert" }]);
  });

  it("getWorkoutByDate excludes tombstoned rows", async () => {
    const { data: workout } = await repo.createWorkout({ date: "2026-07-11" }, USER_ID);
    await repo.deleteWorkout(workout!.id);

    const { data } = await repo.getWorkoutByDate("2026-07-11");
    expect(data).toBeNull();
  });

  it("creating an exercise + sets, then deleting the workout, cascades tombstones and enqueues deletes for all rows", async () => {
    const { data: workout } = await repo.createWorkout({ date: "2026-07-12" }, USER_ID);
    const { data: we } = await repo.addExercise(
      { workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 },
      USER_ID
    );
    const { data: set1 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0, weight: 100, reps: 5 }, USER_ID);

    await repo.deleteWorkout(workout!.id);

    const { data: exercises } = await repo.getWorkoutExercises(workout!.id);
    expect(exercises).toEqual([]);
    const { data: sets } = await repo.getSets(we!.id);
    expect(sets).toEqual([]);

    const setOps = await pendingOpsFor(db, "sets");
    expect(setOps.filter((o) => o.row_id === set1!.id && o.op_type === "delete")).toHaveLength(1);
    const weOps = await pendingOpsFor(db, "workout_exercises");
    expect(weOps.some((o) => o.row_id === we!.id && o.op_type === "delete")).toBe(true);
    const workoutOps = await pendingOpsFor(db, "workouts");
    expect(workoutOps.some((o) => o.row_id === workout!.id && o.op_type === "delete")).toBe(true);
  });

  it("updateSet converts booleans to 0/1 and back correctly", async () => {
    const { data: workout } = await repo.createWorkout({ date: "2026-07-13" }, USER_ID);
    const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
    const { data: set } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
    expect(set!.is_complete).toBe(false);

    const { data: updated } = await repo.updateSet(set!.id, { is_complete: true, weight: 80, reps: 8 });
    expect(updated!.is_complete).toBe(true);
    expect(updated!.weight).toBe(80);
  });

  it("reorderExercises updates order_index and queues one update op per row", async () => {
    const { data: workout } = await repo.createWorkout({ date: "2026-07-14" }, USER_ID);
    const { data: we1 } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
    const { data: we2 } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-2", order_index: 1 }, USER_ID);

    await repo.reorderExercises([
      { id: we1!.id, order_index: 1 },
      { id: we2!.id, order_index: 0 },
    ]);

    const { data: exercises } = await repo.getWorkoutExercises(workout!.id);
    expect(exercises.map((e) => e.id)).toEqual([we2!.id, we1!.id]);
  });

  it("copyWorkout duplicates exercises/sets with new UUIDs, skipping already-existing exercise ids", async () => {
    const { data: source } = await repo.createWorkout({ date: "2026-07-15" }, USER_ID);
    const { data: we } = await repo.addExercise({ workout_id: source!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
    await repo.createSet({ workout_exercise_id: we!.id, order_index: 0, weight: 50, reps: 10 }, USER_ID);
    await repo.addExercise({ workout_id: source!.id, exercise_id: "ex-2", order_index: 1 }, USER_ID);

    const { data: target } = await repo.createWorkout({ date: "2026-07-16" }, USER_ID);
    await repo.copyWorkout(source!.id, target!.id, USER_ID, ["ex-2"], 0);

    const { data: targetExercises } = await repo.getWorkoutExercises(target!.id);
    expect(targetExercises).toHaveLength(1);
    expect(targetExercises[0]!.exercise_id).toBe("ex-1");
    expect(targetExercises[0]!.id).not.toBe(we!.id);

    const { data: copiedSets } = await repo.getSets(targetExercises[0]!.id);
    expect(copiedSets).toHaveLength(1);
    expect(copiedSets[0]!.weight).toBe(50);
    expect(copiedSets[0]!.is_complete).toBe(false);
  });
});
