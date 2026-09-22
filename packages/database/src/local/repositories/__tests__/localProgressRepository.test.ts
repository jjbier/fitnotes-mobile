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

  /**
   * Simula el duplicado aceptado tras claim+sync (ver CLAUDE.md/offline-sync.md):
   * el mismo evento genera dos filas en `personal_records` con el mismo
   * `exercise_id`/`reps`/`weight` pero distinto `id`/`achieved_at` — una vía
   * `maybeRecordPersonalRecord` local, otra vía el trigger SQL remoto al
   * pushear el set. Los tests insertan la segunda fila a mano (no hay forma
   * de disparar el trigger remoto desde el repo local).
   */
  async function insertDuplicatePr(exerciseId: string, reps: number, weight: number, achievedAt: string) {
    await db.runAsync(
      `INSERT INTO personal_records (id, user_id, exercise_id, weight, reps, achieved_at, created_at, updated_at, _dirty, _deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [`dup-${exerciseId}-${reps}-${achievedAt}`, USER_ID, exerciseId, weight, reps, achievedAt, achievedAt, achievedAt]
    );
  }

  it("getPersonalRecords collapses a duplicate PR row (same exercise/reps/weight, different id) into a single entry", async () => {
    await completeSet("ex-1", "2026-07-17", { weight: 80, reps: 8 });
    await insertDuplicatePr("ex-1", 8, 80, "2026-07-17T12:00:00.000Z");

    const { data } = await progressRepo.getPersonalRecords("ex-1");
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ reps: 8, weight: 80 });
  });

  it("getPersonalRecords keeps only the higher-weight row when a stale/duplicate row has a lower weight", async () => {
    await completeSet("ex-1", "2026-07-17", { weight: 80, reps: 8 });
    await insertDuplicatePr("ex-1", 8, 60, "2026-07-16T12:00:00.000Z");

    const { data } = await progressRepo.getPersonalRecords("ex-1");
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ reps: 8, weight: 80 });
  });

  it("getAllPersonalRecords also collapses duplicates across exercises", async () => {
    await completeSet("ex-1", "2026-07-17", { weight: 80, reps: 8 });
    await insertDuplicatePr("ex-1", 8, 80, "2026-07-17T12:00:00.000Z");
    await completeSet("ex-2", "2026-07-18", { weight: 40, reps: 12 });

    const { data } = await progressRepo.getAllPersonalRecords();
    expect(data).toHaveLength(2);
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

  describe("getChartData", () => {
    it("aggregates completed, non-warmup sets per date (max/total weight, reps, est1RM, weightByReps)", async () => {
      await completeSet("ex-1", "2026-07-17", { weight: 80, reps: 8 });
      await completeSet("ex-1", "2026-07-17", { weight: 90, reps: 5 });
      await completeSet("ex-1", "2026-07-17", { weight: 40, reps: 20, is_warmup: true });
      await completeSet("ex-1", "2026-07-18", { weight: 100, reps: 3 });

      const points = await progressRepo.getChartData("ex-1");
      expect(points.map((p) => p.date)).toEqual(["2026-07-17", "2026-07-18"]);

      const day1 = points[0]!;
      expect(day1.maxWeight).toBe(90);
      expect(day1.totalVolume).toBe(80 * 8 + 90 * 5);
      expect(day1.maxReps).toBe(8);
      expect(day1.totalReps).toBe(13);
      expect(day1.weightByReps).toEqual({ 8: 80, 5: 90 });
      expect(day1.est1RM).toBeCloseTo(Math.max(80 * (36 / 29), 90 * (36 / 32)));

      const day2 = points[1]!;
      expect(day2.maxWeight).toBe(100);
    });

    it("returns an empty array for an exercise with no completed sets", async () => {
      const points = await progressRepo.getChartData("ex-missing");
      expect(points).toEqual([]);
    });

    it("computes speed/pace for sets with both distance and time", async () => {
      const { data: workout } = await workoutRepo.createWorkout({ date: "2026-07-17" }, USER_ID);
      const { data: we } = await workoutRepo.addExercise(
        { workout_id: workout!.id, exercise_id: "ex-run", order_index: 0 },
        USER_ID
      );
      const { data: set } = await workoutRepo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await workoutRepo.updateSet(set!.id, { is_complete: true, distance: 5, time_seconds: 1800 });

      const points = await progressRepo.getChartData("ex-run");
      expect(points[0]!.maxSpeed).toBeCloseTo((5 / 1800) * 3600);
      expect(points[0]!.bestPace).toBeCloseTo(1800 / 5);
    });
  });
});
