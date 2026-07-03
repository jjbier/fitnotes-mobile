import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalExerciseRepository } from "../localExerciseRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";

const USER_ID = "user-1";

describe("localExerciseRepository", () => {
  let db: SqlExecutor;
  let repo: ReturnType<typeof createLocalExerciseRepository>;

  beforeEach(async () => {
    db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    repo = createLocalExerciseRepository(db);
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
});
