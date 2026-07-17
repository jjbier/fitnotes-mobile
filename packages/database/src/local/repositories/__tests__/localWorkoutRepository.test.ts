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

  describe("personal records (Fase 6 offline)", () => {
    async function personalRecordsFor(exerciseId: string) {
      return db.getAllAsync<{ id: string; exercise_id: string; reps: number; weight: number; user_id: string }>(
        "SELECT id, exercise_id, reps, weight, user_id FROM personal_records WHERE exercise_id = ? AND _deleted = 0",
        [exerciseId]
      );
    }

    it("creates a PR when weight/reps were set via separate prior updateSet calls before marking complete", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-24" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);

      await repo.updateSet(set!.id, { weight: 80 });
      await repo.updateSet(set!.id, { reps: 8 });
      await repo.updateSet(set!.id, { is_complete: true });

      const prs = await personalRecordsFor("ex-1");
      expect(prs).toEqual([expect.objectContaining({ reps: 8, weight: 80, user_id: USER_ID })]);
    });

    it("completing a set with a weight creates a new PR and queues an insert op", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-17" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);

      await repo.updateSet(set!.id, { is_complete: true, weight: 80, reps: 8 });

      const prs = await personalRecordsFor("ex-1");
      expect(prs).toEqual([expect.objectContaining({ reps: 8, weight: 80, user_id: USER_ID })]);
      const ops = await pendingOpsFor(db, "personal_records");
      expect(ops).toEqual([{ row_id: prs[0]!.id, op_type: "insert" }]);
    });

    it("a lower or equal weight for the same reps does not create a new PR", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-18" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set1 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await repo.updateSet(set1!.id, { is_complete: true, weight: 100, reps: 5 });

      const { data: set2 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 1 }, USER_ID);
      await repo.updateSet(set2!.id, { is_complete: true, weight: 100, reps: 5 });
      const { data: set3 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 2 }, USER_ID);
      await repo.updateSet(set3!.id, { is_complete: true, weight: 90, reps: 5 });

      const prs = await personalRecordsFor("ex-1");
      expect(prs).toHaveLength(1);
      expect(prs[0]!.weight).toBe(100);
    });

    it("a higher weight for the same reps creates an additional PR row", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-19" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set1 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await repo.updateSet(set1!.id, { is_complete: true, weight: 80, reps: 8 });
      const { data: set2 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 1 }, USER_ID);
      await repo.updateSet(set2!.id, { is_complete: true, weight: 85, reps: 8 });

      const prs = await personalRecordsFor("ex-1");
      expect(prs.map((r) => r.weight).sort()).toEqual([80, 85]);
    });

    it("different rep counts are independent records", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-20" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set1 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await repo.updateSet(set1!.id, { is_complete: true, weight: 60, reps: 12 });
      const { data: set2 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 1 }, USER_ID);
      await repo.updateSet(set2!.id, { is_complete: true, weight: 100, reps: 5 });

      const prs = await personalRecordsFor("ex-1");
      expect(prs).toHaveLength(2);
    });

    it("does not create a PR while the set is incomplete", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-21" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      await repo.createSet({ workout_exercise_id: we!.id, order_index: 0, weight: 200, reps: 1 }, USER_ID);

      const prs = await personalRecordsFor("ex-1");
      expect(prs).toEqual([]);
    });

    it("does not create a PR when weight or reps is missing even if marked complete", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-22" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0, reps: 8 }, USER_ID);
      await repo.updateSet(set!.id, { is_complete: true });

      const prs = await personalRecordsFor("ex-1");
      expect(prs).toEqual([]);
    });

    it("does not filter warmup sets, matching the SQL trigger", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-23" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await repo.updateSet(set!.id, { is_complete: true, is_warmup: true, weight: 40, reps: 10 });

      const prs = await personalRecordsFor("ex-1");
      expect(prs).toEqual([expect.objectContaining({ reps: 10, weight: 40 })]);
    });

    it("deleting the workout that generated the only PR removes it", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-25" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await repo.updateSet(set!.id, { is_complete: true, weight: 80, reps: 8 });
      expect(await personalRecordsFor("ex-1")).toHaveLength(1);

      await repo.deleteWorkout(workout!.id);

      expect(await personalRecordsFor("ex-1")).toEqual([]);
    });

    it("deleting the workout with the current-best PR reveals the previous best from another workout", async () => {
      const { data: workoutA } = await repo.createWorkout({ date: "2026-07-26" }, USER_ID);
      const { data: weA } = await repo.addExercise({ workout_id: workoutA!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: setA } = await repo.createSet({ workout_exercise_id: weA!.id, order_index: 0 }, USER_ID);
      await repo.updateSet(setA!.id, { is_complete: true, weight: 80, reps: 8 });

      const { data: workoutB } = await repo.createWorkout({ date: "2026-07-27" }, USER_ID);
      const { data: weB } = await repo.addExercise({ workout_id: workoutB!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: setB } = await repo.createSet({ workout_exercise_id: weB!.id, order_index: 0 }, USER_ID);
      await repo.updateSet(setB!.id, { is_complete: true, weight: 90, reps: 8 });
      expect(await personalRecordsFor("ex-1")).toHaveLength(2);

      await repo.deleteWorkout(workoutB!.id);

      const prs = await personalRecordsFor("ex-1");
      expect(prs).toEqual([expect.objectContaining({ reps: 8, weight: 80 })]);
    });

    it("deleteSet recalculates PRs for the affected exercise", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-28" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set1 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await repo.updateSet(set1!.id, { is_complete: true, weight: 80, reps: 8 });
      const { data: set2 } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 1 }, USER_ID);
      await repo.updateSet(set2!.id, { is_complete: true, weight: 90, reps: 8 });
      expect(await personalRecordsFor("ex-1")).toHaveLength(2);

      await repo.deleteSet(set2!.id);

      const prs = await personalRecordsFor("ex-1");
      expect(prs).toEqual([expect.objectContaining({ reps: 8, weight: 80 })]);
    });

    it("removeExercise recalculates PRs for the removed exercise", async () => {
      const { data: workout } = await repo.createWorkout({ date: "2026-07-29" }, USER_ID);
      const { data: we } = await repo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set } = await repo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await repo.updateSet(set!.id, { is_complete: true, weight: 80, reps: 8 });
      expect(await personalRecordsFor("ex-1")).toHaveLength(1);

      await repo.removeExercise(we!.id);

      expect(await personalRecordsFor("ex-1")).toEqual([]);
    });
  });
});
