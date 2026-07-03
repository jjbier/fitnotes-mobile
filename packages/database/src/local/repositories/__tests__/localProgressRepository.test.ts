import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalProgressRepository } from "../localProgressRepository.js";
import { createLocalWorkoutRepository } from "../localWorkoutRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";

const USER_ID = "user-1";

describe("localProgressRepository", () => {
  let db: SqlExecutor;
  let progressRepo: ReturnType<typeof createLocalProgressRepository>;
  let workoutRepo: ReturnType<typeof createLocalWorkoutRepository>;

  beforeEach(async () => {
    db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    progressRepo = createLocalProgressRepository(db);
    workoutRepo = createLocalWorkoutRepository(db);
  });

  async function completeSet(
    exerciseId: string,
    date: string,
    data: { weight: number; reps: number; is_warmup?: boolean }
  ) {
    const { data: workout } = await workoutRepo.createWorkout({ date }, USER_ID);
    const { data: we } = await workoutRepo.addExercise(
      { workout_id: workout!.id, exercise_id: exerciseId, order_index: 0 },
      USER_ID
    );
    const { data: set } = await workoutRepo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
    await workoutRepo.updateSet(set!.id, { is_complete: true, ...data });
  }

  it("getPersonalRecords returns the PRs generated for that exercise, ordered by reps asc / weight desc", async () => {
    await completeSet("ex-1", "2026-07-17", { weight: 80, reps: 8 });
    await completeSet("ex-1", "2026-07-18", { weight: 100, reps: 5 });

    const { data, error } = await progressRepo.getPersonalRecords("ex-1");
    expect(error).toBeNull();
    expect(data.map((r) => ({ reps: r.reps, weight: r.weight }))).toEqual([
      { reps: 5, weight: 100 },
      { reps: 8, weight: 80 },
    ]);
  });

  it("getAllPersonalRecords includes PRs across every exercise", async () => {
    await completeSet("ex-1", "2026-07-17", { weight: 80, reps: 8 });
    await completeSet("ex-2", "2026-07-18", { weight: 40, reps: 12 });

    const { data } = await progressRepo.getAllPersonalRecords();
    expect(data.map((r) => r.exercise_id).sort()).toEqual(["ex-1", "ex-2"]);
  });

  it("getWeeklyTraining aggregates completed, non-warmup sets from that week onward", async () => {
    await completeSet("ex-1", "2026-07-13", { weight: 80, reps: 8 });
    await completeSet("ex-1", "2026-07-14", { weight: 90, reps: 5 });
    await completeSet("ex-1", "2026-07-01", { weight: 200, reps: 1 });
    await completeSet("ex-1", "2026-07-15", { weight: 50, reps: 10, is_warmup: true });

    const result = await progressRepo.getWeeklyTraining("2026-07-13");
    expect(result).toEqual([{ exerciseId: "ex-1", setCount: 2, volume: 80 * 8 + 90 * 5 }]);
  });

  it("getBestSetsByExercise returns the max reps/distance/time for completed, non-warmup sets", async () => {
    await completeSet("ex-1", "2026-07-17", { weight: 0, reps: 12 });
    await completeSet("ex-1", "2026-07-18", { weight: 0, reps: 8 });
    await completeSet("ex-1", "2026-07-19", { weight: 0, reps: 20, is_warmup: true });

    const result = await progressRepo.getBestSetsByExercise(["ex-1", "ex-missing"]);
    expect(result).toEqual({ "ex-1": { maxReps: 12, maxDistance: 0, maxTime: 0 } });
  });

  it("getBestSetsByExercise returns an empty object for an empty input", async () => {
    const result = await progressRepo.getBestSetsByExercise([]);
    expect(result).toEqual({});
  });
});
