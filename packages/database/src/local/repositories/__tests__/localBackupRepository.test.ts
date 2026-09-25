import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalBackupRepository } from "../localBackupRepository.js";
import { createLocalWorkoutRepository } from "../localWorkoutRepository.js";
import { createLocalExerciseRepository } from "../localExerciseRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";
import type { BackupData } from "../../../repositories/backupRepository.js";

const USER_ID = "user-1";

async function setup() {
  const db = createNodeSqlExecutor();
  await runLocalMigrations(db);
  return {
    db,
    backupRepo: createLocalBackupRepository(db),
    workoutRepo: createLocalWorkoutRepository(db),
    exerciseRepo: createLocalExerciseRepository(db),
  };
}

function emptyBackup(overrides: Partial<BackupData> = {}): BackupData {
  return {
    version: 1,
    exported_at: "2026-01-01T00:00:00.000Z",
    categories: [], exercises: [], routines: [], routine_days: [], routine_day_exercises: [],
    predefined_sets: [], body_measurements: [], body_measurement_entries: [],
    workouts: [], workout_exercises: [], sets: [], personal_records: [], exercise_goals: [],
    ...overrides,
  };
}

describe("localBackupRepository", () => {
  let db: SqlExecutor;
  let backupRepo: Awaited<ReturnType<typeof setup>>["backupRepo"];
  let workoutRepo: Awaited<ReturnType<typeof setup>>["workoutRepo"];
  let exerciseRepo: Awaited<ReturnType<typeof setup>>["exerciseRepo"];

  beforeEach(async () => {
    const s = await setup();
    db = s.db;
    backupRepo = s.backupRepo;
    workoutRepo = s.workoutRepo;
    exerciseRepo = s.exerciseRepo;
  });

  describe("exportBackup", () => {
    it("returns every table empty for a fresh database", async () => {
      const data = await backupRepo.exportBackup();
      expect(data.version).toBe(1);
      expect(data.categories).toEqual([]);
      expect(data.workouts).toEqual([]);
      expect(data.personal_records).toEqual([]);
    });

    it("exports live rows with real JS booleans instead of SQLite 0/1, and excludes tombstoned rows", async () => {
      const { data: category } = await exerciseRepo.createCategory({ name: "Pecho" }, USER_ID);
      const { data: exercise } = await exerciseRepo.createExercise(
        { name: "Press banca", category_id: category!.id, type: "WEIGHT_REPS", is_favorite: true },
        USER_ID
      );
      const { data: toDelete } = await exerciseRepo.createExercise({ name: "Borrado", type: "WEIGHT_REPS" }, USER_ID);
      await exerciseRepo.deleteExercise(toDelete!.id);

      const data = await backupRepo.exportBackup();
      expect(data.exercises).toHaveLength(1);
      expect(data.exercises[0]).toMatchObject({ id: exercise!.id, name: "Press banca", is_favorite: true });
      expect(typeof data.exercises[0]!.is_favorite).toBe("boolean");
    });

    it("exports personal_records already deduplicated (via getAllPersonalRecords)", async () => {
      const { data: workout } = await workoutRepo.createWorkout({ date: "2026-07-01" }, USER_ID);
      const { data: we } = await workoutRepo.addExercise({ workout_id: workout!.id, exercise_id: "ex-1", order_index: 0 }, USER_ID);
      const { data: set } = await workoutRepo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await workoutRepo.updateSet(set!.id, { is_complete: true, weight: 80, reps: 8 });
      // Simulates a pre-migration duplicate PR row for the same (exercise_id, reps).
      await db.runAsync(
        `INSERT INTO personal_records (id, user_id, exercise_id, weight, reps, achieved_at, created_at, updated_at, _dirty, _deleted)
         VALUES ('dup-1', ?, 'ex-1', 80, 8, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z', 0, 0)`,
        [USER_ID]
      );

      const data = await backupRepo.exportBackup();
      expect(data.personal_records).toHaveLength(1);
    });
  });

  describe("restoreBackup", () => {
    it("wipes existing local data and replaces it with the backup content", async () => {
      const { data: oldWorkout } = await workoutRepo.createWorkout({ date: "2026-06-01" }, USER_ID);

      const backup = emptyBackup({
        categories: [{ id: "c1", name: "Pecho", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
        workouts: [{ id: "w1", date: "2026-07-01", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
      });
      const { error } = await backupRepo.restoreBackup(USER_ID, backup);
      expect(error).toBeNull();

      expect((await workoutRepo.getWorkout(oldWorkout!.id)).data).toBeNull();
      const { data: restoredWorkout } = await workoutRepo.getWorkout("w1");
      expect(restoredWorkout?.date).toBe("2026-07-01");
      const { data: categories } = await exerciseRepo.getCategories();
      expect(categories.map((c) => c.id)).toEqual(["c1"]);
    });

    it("forces user_id on every restored row, regardless of the backup's own value", async () => {
      const backup = emptyBackup({
        categories: [{ id: "c1", user_id: "someone-else", name: "Pecho", color: "#fff", order_index: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
      });
      await backupRepo.restoreBackup(USER_ID, backup);

      const row = await db.getFirstAsync<{ user_id: string }>(`SELECT user_id FROM categories WHERE id = 'c1'`);
      expect(row?.user_id).toBe(USER_ID);
    });

    it("restores personal_records (not just re-derives them from sets) and deduplicates them", async () => {
      const backup = emptyBackup({
        personal_records: [
          { id: "pr1", exercise_id: "ex-1", weight: 100, reps: 5, achieved_at: "2026-05-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
          { id: "pr2", exercise_id: "ex-1", weight: 100, reps: 5, achieved_at: "2026-05-02T00:00:00Z", created_at: "2026-05-02T00:00:00Z", updated_at: "2026-05-02T00:00:00Z" },
        ],
      });
      await backupRepo.restoreBackup(USER_ID, backup);

      const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM personal_records WHERE _deleted = 0`);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe("pr1"); // older achieved_at wins the tie-break
    });

    it("converts JS booleans back to SQLite integers on restore", async () => {
      const backup = emptyBackup({
        exercises: [{ id: "e1", name: "Dominadas", type: "WEIGHT_REPS", weight_unit: "kg", is_favorite: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
      });
      await backupRepo.restoreBackup(USER_ID, backup);

      const { data: exercises } = await exerciseRepo.getExercises();
      expect(exercises[0]?.is_favorite).toBe(true);
    });

    it("enqueues delete pending_ops for wiped rows and insert pending_ops for restored rows", async () => {
      const { data: oldWorkout } = await workoutRepo.createWorkout({ date: "2026-06-01" }, USER_ID);
      const backup = emptyBackup({
        workouts: [{ id: "w1", date: "2026-07-01", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
      });
      await backupRepo.restoreBackup(USER_ID, backup);

      const deleteOp = await db.getFirstAsync(
        `SELECT * FROM pending_ops WHERE table_name = 'workouts' AND row_id = ? AND op_type = 'delete'`,
        [oldWorkout!.id]
      );
      expect(deleteOp).not.toBeNull();
      const insertOp = await db.getFirstAsync(
        `SELECT * FROM pending_ops WHERE table_name = 'workouts' AND row_id = 'w1' AND op_type = 'insert'`
      );
      expect(insertOp).not.toBeNull();
    });
  });

  describe("recalculatePersonalRecords", () => {
    it("rebuilds PRs from live sets, including warmup sets (matching the app's own incremental rule)", async () => {
      const { data: exercise } = await exerciseRepo.createExercise({ name: "Sentadilla", type: "WEIGHT_REPS" }, USER_ID);
      const { data: workout } = await workoutRepo.createWorkout({ date: "2026-07-10" }, USER_ID);
      const { data: we } = await workoutRepo.addExercise({ workout_id: workout!.id, exercise_id: exercise!.id, order_index: 0 }, USER_ID);
      const { data: set } = await workoutRepo.createSet({ workout_exercise_id: we!.id, order_index: 0 }, USER_ID);
      await workoutRepo.updateSet(set!.id, { is_complete: true, is_warmup: true, weight: 40, reps: 10 });

      // Wipe the PR that maybeRecordPersonalRecord already generated, to prove recalculatePersonalRecords regenerates it from scratch.
      await db.runAsync(`DELETE FROM personal_records`);

      const { data: count, error } = await backupRepo.recalculatePersonalRecords(USER_ID);
      expect(error).toBeNull();
      expect(count).toBe(1);

      const pr = await db.getFirstAsync<{ weight: number; achieved_at: string }>(
        `SELECT weight, achieved_at FROM personal_records WHERE exercise_id = ? AND _deleted = 0`,
        [exercise!.id]
      );
      expect(pr?.weight).toBe(40);
      expect(pr?.achieved_at).toBe(set!.created_at); // real historical date, not "today"
    });

    it("removes a PR whose exercise no longer has any qualifying set", async () => {
      await db.runAsync(
        `INSERT INTO personal_records (id, user_id, exercise_id, weight, reps, achieved_at, created_at, updated_at, _dirty, _deleted)
         VALUES ('orphan-1', ?, 'ex-orphan', 20, 12, '2026-07-17T00:00:00Z', '2026-07-17T00:00:00Z', '2026-07-17T00:00:00Z', 1, 0)`,
        [USER_ID]
      );

      const { data: count } = await backupRepo.recalculatePersonalRecords(USER_ID);
      expect(count).toBe(0);
      const row = await db.getFirstAsync(`SELECT id FROM personal_records WHERE id = 'orphan-1' AND _deleted = 0`);
      expect(row).toBeNull();
    });

    it("hard-deletes a PR referencing a tombstoned exercise (e.g. merged away by mergeDuplicateCatalogEntries) and purges its stuck insert pending_op, instead of trying to regenerate it", async () => {
      const { data: exercise } = await exerciseRepo.createExercise({ name: "Fusionado", type: "WEIGHT_REPS" }, USER_ID);
      await db.runAsync(
        `INSERT INTO personal_records (id, user_id, exercise_id, weight, reps, achieved_at, created_at, updated_at, _dirty, _deleted)
         VALUES ('ghost-pr', ?, ?, 100, 5, '2026-07-17T00:00:00Z', '2026-07-17T00:00:00Z', '2026-07-17T00:00:00Z', 1, 0)`,
        [USER_ID, exercise!.id]
      );
      await db.runAsync(
        `INSERT INTO pending_ops (table_name, row_id, op_type, payload, created_at) VALUES ('personal_records', 'ghost-pr', 'insert', '{}', '2026-07-17T00:00:00Z')`
      );
      // Simulates mergeDuplicateCatalogEntries tombstoning the exercise without this stale PR row being rewritten first.
      await exerciseRepo.deleteExercise(exercise!.id);
      // deleteExercise's own cascade doesn't touch personal_records (it has no such cascade), so 'ghost-pr' is still live and still dangling.
      expect(await db.getFirstAsync(`SELECT id FROM personal_records WHERE id = 'ghost-pr' AND _deleted = 0`)).not.toBeNull();

      const { data: count, error } = await backupRepo.recalculatePersonalRecords(USER_ID);
      expect(error).toBeNull();
      expect(count).toBe(0);

      const row = await db.getFirstAsync(`SELECT id FROM personal_records WHERE id = 'ghost-pr'`);
      expect(row).toBeNull(); // hard-deleted, not just tombstoned
      const pendingOp = await db.getFirstAsync(`SELECT id FROM pending_ops WHERE table_name = 'personal_records' AND row_id = 'ghost-pr'`);
      expect(pendingOp).toBeNull(); // the stuck insert op is purged, not retried forever
    });
  });
});
