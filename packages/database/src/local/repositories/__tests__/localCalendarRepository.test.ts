import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalCalendarRepository } from "../localCalendarRepository.js";
import { createLocalWorkoutRepository } from "../localWorkoutRepository.js";
import { createLocalExerciseRepository } from "../localExerciseRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";

const USER_ID = "user-1";

async function setup() {
  const db = createNodeSqlExecutor();
  await runLocalMigrations(db);
  const repo = createLocalCalendarRepository(db);
  const workoutRepo = createLocalWorkoutRepository(db);
  const exerciseRepo = createLocalExerciseRepository(db);
  return { db, repo, workoutRepo, exerciseRepo };
}

describe("localCalendarRepository", () => {
  let db: SqlExecutor;
  let repo: Awaited<ReturnType<typeof setup>>["repo"];
  let workoutRepo: Awaited<ReturnType<typeof setup>>["workoutRepo"];
  let exerciseRepo: Awaited<ReturnType<typeof setup>>["exerciseRepo"];

  beforeEach(async () => {
    const s = await setup();
    db = s.db;
    repo = s.repo;
    workoutRepo = s.workoutRepo;
    exerciseRepo = s.exerciseRepo;
  });

  it("getWorkoutsForMonth only returns workouts within the month range", async () => {
    await workoutRepo.createWorkout({ date: "2026-06-30" }, USER_ID);
    await workoutRepo.createWorkout({ date: "2026-07-15" }, USER_ID);
    await workoutRepo.createWorkout({ date: "2026-08-01" }, USER_ID);

    const { data } = await repo.getWorkoutsForMonth(2026, 7);
    expect(data.map((w) => w.date)).toEqual(["2026-07-15"]);
  });

  it("getWorkoutsForMonth excludes a tombstoned (deleted) workout", async () => {
    const { data: workout } = await workoutRepo.createWorkout({ date: "2026-07-10" }, USER_ID);
    await workoutRepo.deleteWorkout(workout!.id);

    const { data } = await repo.getWorkoutsForMonth(2026, 7);
    expect(data).toEqual([]);
  });

  it("getWorkoutCategoryColorsForMonth dedupes categories per date", async () => {
    const { data: cat } = await exerciseRepo.createCategory({ name: "Pecho", color: "#ff0000" }, USER_ID);
    const { data: ex1 } = await exerciseRepo.createExercise({ name: "Press banca", category_id: cat!.id, type: "WEIGHT_REPS" }, USER_ID);
    const { data: ex2 } = await exerciseRepo.createExercise({ name: "Aperturas", category_id: cat!.id, type: "WEIGHT_REPS" }, USER_ID);
    const { data: workout } = await workoutRepo.createWorkout({ date: "2026-07-10" }, USER_ID);
    await workoutRepo.addExercise({ workout_id: workout!.id, exercise_id: ex1!.id, order_index: 0 }, USER_ID);
    await workoutRepo.addExercise({ workout_id: workout!.id, exercise_id: ex2!.id, order_index: 1 }, USER_ID);

    const colors = await repo.getWorkoutCategoryColorsForMonth(2026, 7);
    expect(colors).toEqual({ "2026-07-10": ["#ff0000"] });
  });

  it("getWorkoutCategoryIdsForMonth returns the category ids per date", async () => {
    const { data: cat } = await exerciseRepo.createCategory({ name: "Pecho" }, USER_ID);
    const { data: ex } = await exerciseRepo.createExercise({ name: "Press banca", category_id: cat!.id, type: "WEIGHT_REPS" }, USER_ID);
    const { data: workout } = await workoutRepo.createWorkout({ date: "2026-07-10" }, USER_ID);
    await workoutRepo.addExercise({ workout_id: workout!.id, exercise_id: ex!.id, order_index: 0 }, USER_ID);

    const ids = await repo.getWorkoutCategoryIdsForMonth(2026, 7);
    expect(ids).toEqual({ "2026-07-10": [cat!.id] });
  });

  it("getWorkoutSummary returns the workout with its exercise names in order", async () => {
    const { data: ex1 } = await exerciseRepo.createExercise({ name: "Sentadilla", type: "WEIGHT_REPS" }, USER_ID);
    const { data: ex2 } = await exerciseRepo.createExercise({ name: "Peso muerto", type: "WEIGHT_REPS" }, USER_ID);
    const { data: workout } = await workoutRepo.createWorkout({ date: "2026-07-10", comment: "Buen día" }, USER_ID);
    await workoutRepo.addExercise({ workout_id: workout!.id, exercise_id: ex1!.id, order_index: 0 }, USER_ID);
    await workoutRepo.addExercise({ workout_id: workout!.id, exercise_id: ex2!.id, order_index: 1 }, USER_ID);

    const { data } = await repo.getWorkoutSummary("2026-07-10");
    expect(data?.comment).toBe("Buen día");
    expect(data?.workout_exercises.map((we) => we.exercises?.name)).toEqual(["Sentadilla", "Peso muerto"]);
  });

  it("getWorkoutSummary returns null when there is no workout that day", async () => {
    const { data } = await repo.getWorkoutSummary("2026-07-10");
    expect(data).toBeNull();
  });

  it("getWorkoutHistoryDetailed dedupes categories per workout and orders most recent first", async () => {
    const { data: cat } = await exerciseRepo.createCategory({ name: "Pierna", color: "#00ff00" }, USER_ID);
    const { data: ex } = await exerciseRepo.createExercise({ name: "Sentadilla", category_id: cat!.id, type: "WEIGHT_REPS" }, USER_ID);
    const { data: w1 } = await workoutRepo.createWorkout({ date: "2026-07-01" }, USER_ID);
    await workoutRepo.addExercise({ workout_id: w1!.id, exercise_id: ex!.id, order_index: 0 }, USER_ID);
    const { data: w2 } = await workoutRepo.createWorkout({ date: "2026-07-05" }, USER_ID);
    await workoutRepo.addExercise({ workout_id: w2!.id, exercise_id: ex!.id, order_index: 0 }, USER_ID);

    const history = await repo.getWorkoutHistoryDetailed(10);
    expect(history.map((h) => h.date)).toEqual(["2026-07-05", "2026-07-01"]);
    expect(history[0]!.categories).toEqual([{ id: cat!.id, name: "Pierna", color: "#00ff00" }]);
  });

  it("getWorkoutSetDetail returns ordered exercises with their completed sets", async () => {
    const { data: ex } = await exerciseRepo.createExercise({ name: "Press banca", type: "WEIGHT_REPS" }, USER_ID);
    const { data: workout } = await workoutRepo.createWorkout({ date: "2026-07-10" }, USER_ID);
    const { data: we } = await workoutRepo.addExercise({ workout_id: workout!.id, exercise_id: ex!.id, order_index: 0 }, USER_ID);
    const { data: set } = await workoutRepo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
    await workoutRepo.updateSet(set!.id, { is_complete: true, weight: 80, reps: 8 });

    const { data } = await repo.getWorkoutSetDetail(workout!.id);
    expect(data?.workout_exercises).toHaveLength(1);
    expect(data?.workout_exercises[0]!.exercises?.name).toBe("Press banca");
    expect(data?.workout_exercises[0]!.sets).toEqual([
      { weight: 80, reps: 8, distance: null, time_seconds: null, is_complete: true, is_warmup: false, order_index: 0 },
    ]);
  });

  it("getWorkoutDatesForExerciseWithConditions filters by minimum weight/reps", async () => {
    const { data: ex } = await exerciseRepo.createExercise({ name: "Press banca", type: "WEIGHT_REPS" }, USER_ID);
    const { data: w1 } = await workoutRepo.createWorkout({ date: "2026-07-01" }, USER_ID);
    const { data: we1 } = await workoutRepo.addExercise({ workout_id: w1!.id, exercise_id: ex!.id, order_index: 0 }, USER_ID);
    await workoutRepo.createSet({ workout_exercise_id: we1!.id, order_index: 0, weight: 60, reps: 10 }, USER_ID);

    const { data: w2 } = await workoutRepo.createWorkout({ date: "2026-07-02" }, USER_ID);
    const { data: we2 } = await workoutRepo.addExercise({ workout_id: w2!.id, exercise_id: ex!.id, order_index: 0 }, USER_ID);
    await workoutRepo.createSet({ workout_exercise_id: we2!.id, order_index: 0, weight: 100, reps: 5 }, USER_ID);

    const allDates = await repo.getWorkoutDatesForExerciseWithConditions(ex!.id);
    expect(allDates.sort()).toEqual(["2026-07-01", "2026-07-02"]);

    const heavyDates = await repo.getWorkoutDatesForExerciseWithConditions(ex!.id, 90);
    expect(heavyDates).toEqual(["2026-07-02"]);
  });
});
