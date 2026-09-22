import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalExerciseRepository } from "../localExerciseRepository.js";
import { createLocalWorkoutRepository } from "../localWorkoutRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";

const USER_ID = "user-1";

describe("localExerciseRepository", () => {
  let db: SqlExecutor;
  let repo: ReturnType<typeof createLocalExerciseRepository>;
  let workoutRepo: ReturnType<typeof createLocalWorkoutRepository>;

  beforeEach(async () => {
    db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    repo = createLocalExerciseRepository(db);
    workoutRepo = createLocalWorkoutRepository(db);
  });

  it("creates a category with a real UUID and queues an insert op", async () => {
    const { data, error } = await repo.createCategory({ name: "Pecho" }, USER_ID);
    expect(error).toBeNull();
    expect(data?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(data?.color).toBe("#6366f1"); // default

    const ops = await db.getAllAsync("SELECT row_id FROM pending_ops WHERE table_name = 'categories'");
    expect(ops).toEqual([{ row_id: data!.id }]);
  });

  it("getCategories excludes tombstoned rows and orders by order_index", async () => {
    await repo.createCategory({ name: "B", order_index: 1 }, USER_ID);
    const { data: a } = await repo.createCategory({ name: "A", order_index: 0 }, USER_ID);
    await repo.deleteCategory(a!.id);

    const { data } = await repo.getCategories();
    expect(data.map((c) => c.name)).toEqual(["B"]);
  });

  it("creates an exercise, converts is_favorite boolean to 0/1 and back", async () => {
    const { data: category } = await repo.createCategory({ name: "Pecho" }, USER_ID);
    const { data: exercise } = await repo.createExercise(
      { name: "Press banca", category_id: category!.id, type: "WEIGHT_REPS" },
      USER_ID
    );
    expect(exercise?.is_favorite).toBe(false);

    const { data: updated } = await repo.toggleFavorite(exercise!.id, true);
    expect(updated?.is_favorite).toBe(true);

    const { data: list } = await repo.getExercises(category!.id);
    expect(list[0]!.is_favorite).toBe(true);
  });

  it("getExercises filters by category when given", async () => {
    const { data: catA } = await repo.createCategory({ name: "A" }, USER_ID);
    const { data: catB } = await repo.createCategory({ name: "B" }, USER_ID);
    await repo.createExercise({ name: "Ex A", category_id: catA!.id, type: "WEIGHT_REPS" }, USER_ID);
    await repo.createExercise({ name: "Ex B", category_id: catB!.id, type: "WEIGHT_REPS" }, USER_ID);

    const { data } = await repo.getExercises(catA!.id);
    expect(data.map((e) => e.name)).toEqual(["Ex A"]);
  });

  it("deleteExercise tombstones the row and queues a delete op", async () => {
    const { data: exercise } = await repo.createExercise({ name: "Sentadilla", type: "WEIGHT_REPS" }, USER_ID);
    await repo.deleteExercise(exercise!.id);

    const { data } = await repo.getExercises();
    expect(data).toEqual([]);
    const ops = await db.getAllAsync<{ op_type: string }>(
      "SELECT op_type FROM pending_ops WHERE table_name = 'exercises' AND row_id = ?",
      [exercise!.id]
    );
    expect(ops.some((o) => o.op_type === "delete")).toBe(true);
  });

  it("deleteExercise cascades to workout_exercises/sets and routine_day_exercises/predefined_sets", async () => {
    const { data: exercise } = await repo.createExercise({ name: "Sentadilla", type: "WEIGHT_REPS" }, USER_ID);
    const exerciseId = exercise!.id;
    const ts = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO workout_exercises (id, user_id, workout_id, exercise_id, order_index, created_at, updated_at, _dirty, _deleted) VALUES ('we-1', ?, 'w-1', ?, 0, ?, ?, 0, 0)`,
      [USER_ID, exerciseId, ts, ts]
    );
    await db.runAsync(
      `INSERT INTO sets (id, user_id, workout_exercise_id, order_index, is_complete, created_at, updated_at, _dirty, _deleted) VALUES ('s-1', ?, 'we-1', 0, 0, ?, ?, 0, 0)`,
      [USER_ID, ts, ts]
    );
    await db.runAsync(
      `INSERT INTO routine_day_exercises (id, user_id, routine_day_id, exercise_id, order_index, created_at, updated_at, _dirty, _deleted) VALUES ('rde-1', ?, 'rd-1', ?, 0, ?, ?, 0, 0)`,
      [USER_ID, exerciseId, ts, ts]
    );
    await db.runAsync(
      `INSERT INTO predefined_sets (id, user_id, routine_day_exercise_id, order_index, created_at, updated_at, _dirty, _deleted) VALUES ('ps-1', ?, 'rde-1', 0, ?, ?, 0, 0)`,
      [USER_ID, ts, ts]
    );

    await repo.deleteExercise(exerciseId);

    const remaining = await db.getAllAsync<{ n: number }>(
      `SELECT
        (SELECT COUNT(*) FROM workout_exercises WHERE id = 'we-1' AND _deleted = 0) +
        (SELECT COUNT(*) FROM sets WHERE id = 's-1' AND _deleted = 0) +
        (SELECT COUNT(*) FROM routine_day_exercises WHERE id = 'rde-1' AND _deleted = 0) +
        (SELECT COUNT(*) FROM predefined_sets WHERE id = 'ps-1' AND _deleted = 0) AS n`
    );
    expect(remaining[0]!.n).toBe(0);

    const deleteOps = await db.getAllAsync<{ table_name: string }>(
      `SELECT table_name FROM pending_ops WHERE op_type = 'delete' AND row_id IN ('we-1', 's-1', 'rde-1', 'ps-1')`
    );
    expect(deleteOps.map((o) => o.table_name).sort()).toEqual(
      ["predefined_sets", "routine_day_exercises", "sets", "workout_exercises"]
    );
  });

  it("deleteCategory sets category_id to null on its exercises instead of orphaning them", async () => {
    const { data: category } = await repo.createCategory({ name: "Pecho" }, USER_ID);
    const { data: exercise } = await repo.createExercise(
      { name: "Press banca", category_id: category!.id, type: "WEIGHT_REPS" },
      USER_ID
    );

    await repo.deleteCategory(category!.id);

    const { data } = await repo.getExercises();
    expect(data[0]!.category_id).toBeNull();
    const ops = await db.getAllAsync<{ op_type: string; row_id: string }>(
      "SELECT op_type, row_id FROM pending_ops WHERE table_name = 'exercises' AND row_id = ?",
      [exercise!.id]
    );
    expect(ops.some((o) => o.op_type === "update")).toBe(true);
  });

  it("reorderCategories updates order_index for all given rows", async () => {
    const { data: a } = await repo.createCategory({ name: "A", order_index: 0 }, USER_ID);
    const { data: b } = await repo.createCategory({ name: "B", order_index: 1 }, USER_ID);

    await repo.reorderCategories([
      { id: a!.id, order_index: 1 },
      { id: b!.id, order_index: 0 },
    ]);

    const { data } = await repo.getCategories();
    expect(data.map((c) => c.name)).toEqual(["B", "A"]);
  });

  describe("getExerciseHistory", () => {
    it("returns sessions ordered by date descending, with sets ordered by order_index", async () => {
      const { data: exercise } = await repo.createExercise({ name: "Press banca", type: "WEIGHT_REPS" }, USER_ID);
      const exerciseId = exercise!.id;

      const { data: w1 } = await workoutRepo.createWorkout({ date: "2026-07-17", comment: "Día 1" }, USER_ID);
      const { data: we1 } = await workoutRepo.addExercise(
        { workout_id: w1!.id, exercise_id: exerciseId, order_index: 0 },
        USER_ID
      );
      const { data: set2 } = await workoutRepo.createSet({ workout_exercise_id: we1!.id, order_index: 1 }, USER_ID);
      const { data: set1 } = await workoutRepo.createSet({ workout_exercise_id: we1!.id, order_index: 0 }, USER_ID);
      await workoutRepo.updateSet(set1!.id, { weight: 80, reps: 8, is_complete: true });
      await workoutRepo.updateSet(set2!.id, { weight: 82.5, reps: 6, is_complete: true });

      const { data: w2 } = await workoutRepo.createWorkout({ date: "2026-07-18" }, USER_ID);
      await workoutRepo.addExercise({ workout_id: w2!.id, exercise_id: exerciseId, order_index: 0 }, USER_ID);

      const { data, error } = await repo.getExerciseHistory(exerciseId);
      expect(error).toBeNull();
      expect(data.map((s) => s.date)).toEqual(["2026-07-18", "2026-07-17"]);
      expect(data[1]!.comment).toBe("Día 1");
      expect(data[1]!.sets.map((s) => s.order_index)).toEqual([0, 1]);
      expect(data[1]!.sets.map((s) => s.weight)).toEqual([80, 82.5]);
      expect(data[1]!.sets[0]!.is_complete).toBe(true);
    });

    it("returns an empty array for an exercise with no sessions", async () => {
      const { data: exercise } = await repo.createExercise({ name: "Sin uso", type: "WEIGHT_REPS" }, USER_ID);
      const { data, error } = await repo.getExerciseHistory(exercise!.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("ignores tombstoned workouts", async () => {
      const { data: exercise } = await repo.createExercise({ name: "Sentadilla", type: "WEIGHT_REPS" }, USER_ID);
      const { data: w1 } = await workoutRepo.createWorkout({ date: "2026-07-17" }, USER_ID);
      await workoutRepo.addExercise({ workout_id: w1!.id, exercise_id: exercise!.id, order_index: 0 }, USER_ID);
      await workoutRepo.deleteWorkout(w1!.id);

      const { data } = await repo.getExerciseHistory(exercise!.id);
      expect(data).toEqual([]);
    });
  });

  describe("getExerciseStats", () => {
    it("counts distinct workouts per exercise and tracks the most recent date", async () => {
      const { data: exercise } = await repo.createExercise({ name: "Press banca", type: "WEIGHT_REPS" }, USER_ID);
      const { data: w1 } = await workoutRepo.createWorkout({ date: "2026-07-17" }, USER_ID);
      await workoutRepo.addExercise({ workout_id: w1!.id, exercise_id: exercise!.id, order_index: 0 }, USER_ID);
      const { data: w2 } = await workoutRepo.createWorkout({ date: "2026-07-19" }, USER_ID);
      await workoutRepo.addExercise({ workout_id: w2!.id, exercise_id: exercise!.id, order_index: 0 }, USER_ID);

      const { data, error } = await repo.getExerciseStats();
      expect(error).toBeNull();
      expect(data[exercise!.id]).toEqual({ workout_count: 2, last_used: "2026-07-19" });
    });

    it("omits exercises never used", async () => {
      await repo.createExercise({ name: "Sin uso", type: "WEIGHT_REPS" }, USER_ID);
      const { data } = await repo.getExerciseStats();
      expect(data).toEqual({});
    });
  });

  describe("convertExerciseWeights", () => {
    it("multiplies the weight of every set of that exercise by the factor and queues update ops", async () => {
      const { data: exercise } = await repo.createExercise({ name: "Press banca", type: "WEIGHT_REPS" }, USER_ID);
      const { data: workout } = await workoutRepo.createWorkout({ date: "2026-07-17" }, USER_ID);
      const { data: we } = await workoutRepo.addExercise(
        { workout_id: workout!.id, exercise_id: exercise!.id, order_index: 0 },
        USER_ID
      );
      const { data: set1 } = await workoutRepo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await workoutRepo.updateSet(set1!.id, { weight: 100 });
      const { data: set2 } = await workoutRepo.createSet({ workout_exercise_id: we!.id, order_index: 1 }, USER_ID);
      // no weight set on set2

      const { error } = await repo.convertExerciseWeights(exercise!.id, 2.20462);

      const { data: history } = await repo.getExerciseHistory(exercise!.id);
      expect(error).toBeNull();
      const sets = history[0]!.sets;
      expect(sets.find((s) => s.id === set1!.id)!.weight).toBe(220.46);
      expect(sets.find((s) => s.id === set2!.id)!.weight).toBeUndefined();

      const ops = await db.getAllAsync<{ row_id: string }>(
        "SELECT row_id FROM pending_ops WHERE table_name = 'sets' AND op_type = 'update'"
      );
      // set1 gets one update op from the initial `updateSet({ weight: 100 })` plus one from `convertExerciseWeights`; set2 never had its weight touched.
      expect(ops.map((o) => o.row_id)).toEqual([set1!.id, set1!.id]);
    });
  });
});
