import { describe, it, expect } from "vitest";
import { createNodeSqlExecutor } from "../../local/testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../local/migrations.js";
import type { SqlExecutor } from "../../local/sqlExecutor.js";
import { mergeDuplicateCatalogEntries } from "../mergeDuplicateCatalog.js";

const USER = "user-1";

async function insertCategory(db: SqlExecutor, id: string, name: string, createdAt: string) {
  await db.runAsync(
    `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
     VALUES (?, ?, ?, '#fff', 0, ?, ?, 0, 0)`,
    [id, USER, name, createdAt, createdAt]
  );
}

async function insertExercise(db: SqlExecutor, id: string, name: string, categoryId: string | null, createdAt: string) {
  await db.runAsync(
    `INSERT INTO exercises (id, user_id, category_id, name, type, weight_unit, is_favorite, created_at, updated_at, _dirty, _deleted)
     VALUES (?, ?, ?, ?, 'weight_reps', 'kg', 0, ?, ?, 0, 0)`,
    [id, USER, categoryId, name, createdAt, createdAt]
  );
}

async function insertMeasurement(db: SqlExecutor, id: string, name: string, createdAt: string) {
  await db.runAsync(
    `INSERT INTO body_measurements (id, user_id, name, unit, goal_type, is_default, is_enabled, order_index, created_at, updated_at, _dirty, _deleted)
     VALUES (?, ?, ?, 'kg', 'DECREASE', 1, 1, 0, ?, ?, 0, 0)`,
    [id, USER, name, createdAt, createdAt]
  );
}

describe("mergeDuplicateCatalogEntries", () => {
  it("merges categories with the same name (case/whitespace-insensitive), repoints exercises and tombstones the newer one", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await insertCategory(db, "c-old", "Pecho", "2026-01-01T00:00:00Z");
    await insertCategory(db, "c-new", " pecho ", "2026-01-02T00:00:00Z");
    await insertExercise(db, "e1", "Press banca", "c-new", "2026-01-02T00:00:00Z");

    const result = await mergeDuplicateCatalogEntries(db, USER);
    expect(result.mergedCategories).toBe(1);

    const oldCat = await db.getFirstAsync<{ _deleted: number }>(`SELECT _deleted FROM categories WHERE id = 'c-old'`);
    const newCat = await db.getFirstAsync<{ _deleted: number }>(`SELECT _deleted FROM categories WHERE id = 'c-new'`);
    expect(oldCat?._deleted).toBe(0);
    expect(newCat?._deleted).toBe(1);

    const exercise = await db.getFirstAsync<{ category_id: string }>(`SELECT category_id FROM exercises WHERE id = 'e1'`);
    expect(exercise?.category_id).toBe("c-old");

    const deleteOp = await db.getFirstAsync(`SELECT * FROM pending_ops WHERE table_name = 'categories' AND row_id = 'c-new' AND op_type = 'delete'`);
    expect(deleteOp).not.toBeNull();
    const updateOp = await db.getFirstAsync(`SELECT * FROM pending_ops WHERE table_name = 'exercises' AND row_id = 'e1' AND op_type = 'update'`);
    expect(updateOp).not.toBeNull();
  });

  it("merges exercises with the same name within the same (already-canonical) category and repoints every referencing table", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await insertCategory(db, "c1", "Pecho", "2026-01-01T00:00:00Z");
    await insertExercise(db, "ex-old", "Press banca", "c1", "2026-01-01T00:00:00Z");
    await insertExercise(db, "ex-new", "Press banca", "c1", "2026-01-02T00:00:00Z");

    await db.runAsync(
      `INSERT INTO workout_exercises (id, user_id, workout_id, exercise_id, order_index, created_at, updated_at, _dirty, _deleted)
       VALUES ('we1', ?, 'w1', 'ex-new', 0, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', 0, 0)`,
      [USER]
    );
    await db.runAsync(
      `INSERT INTO personal_records (id, user_id, exercise_id, weight, reps, achieved_at, created_at, updated_at, _dirty, _deleted)
       VALUES ('pr1', ?, 'ex-new', 100, 5, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', 0, 0)`,
      [USER]
    );
    await db.runAsync(
      `INSERT INTO exercise_goals (id, user_id, exercise_id, target_weight, created_at, updated_at, _dirty, _deleted)
       VALUES ('g1', ?, 'ex-new', 120, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', 0, 0)`,
      [USER]
    );

    const result = await mergeDuplicateCatalogEntries(db, USER);
    expect(result.mergedExercises).toBe(1);

    const we = await db.getFirstAsync<{ exercise_id: string }>(`SELECT exercise_id FROM workout_exercises WHERE id = 'we1'`);
    const pr = await db.getFirstAsync<{ exercise_id: string }>(`SELECT exercise_id FROM personal_records WHERE id = 'pr1'`);
    const goal = await db.getFirstAsync<{ exercise_id: string }>(`SELECT exercise_id FROM exercise_goals WHERE id = 'g1'`);
    expect(we?.exercise_id).toBe("ex-old");
    expect(pr?.exercise_id).toBe("ex-old");
    expect(goal?.exercise_id).toBe("ex-old");

    const newExercise = await db.getFirstAsync<{ _deleted: number }>(`SELECT _deleted FROM exercises WHERE id = 'ex-new'`);
    expect(newExercise?._deleted).toBe(1);
  });

  it("does not merge same-named exercises that live in different categories", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await insertCategory(db, "c1", "Pecho", "2026-01-01T00:00:00Z");
    await insertCategory(db, "c2", "Espalda", "2026-01-01T00:00:00Z");
    await insertExercise(db, "e1", "Remo", "c1", "2026-01-01T00:00:00Z");
    await insertExercise(db, "e2", "Remo", "c2", "2026-01-01T00:00:00Z");

    const result = await mergeDuplicateCatalogEntries(db, USER);
    expect(result.mergedExercises).toBe(0);
    const e2 = await db.getFirstAsync<{ _deleted: number }>(`SELECT _deleted FROM exercises WHERE id = 'e2'`);
    expect(e2?._deleted).toBe(0);
  });

  it("merges body measurements with the same name and repoints their entries", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await insertMeasurement(db, "m-old", "Peso corporal", "2026-01-01T00:00:00Z");
    await insertMeasurement(db, "m-new", "Peso corporal", "2026-01-02T00:00:00Z");
    await db.runAsync(
      `INSERT INTO body_measurement_entries (id, user_id, measurement_id, value, recorded_at, created_at, updated_at, _dirty, _deleted)
       VALUES ('bme1', ?, 'm-new', 80, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', 0, 0)`,
      [USER]
    );

    const result = await mergeDuplicateCatalogEntries(db, USER);
    expect(result.mergedBodyMeasurements).toBe(1);

    const entry = await db.getFirstAsync<{ measurement_id: string }>(`SELECT measurement_id FROM body_measurement_entries WHERE id = 'bme1'`);
    expect(entry?.measurement_id).toBe("m-old");
  });

  it("is a no-op when there are no duplicates", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await insertCategory(db, "c1", "Pecho", "2026-01-01T00:00:00Z");
    await insertExercise(db, "e1", "Press banca", "c1", "2026-01-01T00:00:00Z");
    await insertMeasurement(db, "m1", "Peso corporal", "2026-01-01T00:00:00Z");

    const result = await mergeDuplicateCatalogEntries(db, USER);
    expect(result).toEqual({ mergedCategories: 0, mergedExercises: 0, mergedBodyMeasurements: 0 });
  });

  it("ignores already-deleted rows and rows belonging to a different user", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await insertCategory(db, "c1", "Pecho", "2026-01-01T00:00:00Z");
    await db.runAsync(
      `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
       VALUES ('c2', ?, 'Pecho', '#fff', 0, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', 0, 1)`,
      [USER]
    );
    await db.runAsync(
      `INSERT INTO categories (id, user_id, name, color, order_index, created_at, updated_at, _dirty, _deleted)
       VALUES ('c3', 'other-user', 'Pecho', '#fff', 0, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', 0, 0)`
    );

    const result = await mergeDuplicateCatalogEntries(db, USER);
    expect(result.mergedCategories).toBe(0);
  });
});
