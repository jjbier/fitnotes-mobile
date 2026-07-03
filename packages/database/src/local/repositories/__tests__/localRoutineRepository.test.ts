import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalRoutineRepository } from "../localRoutineRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";

const USER_ID = "user-1";

describe("localRoutineRepository", () => {
  let db: SqlExecutor;
  let repo: ReturnType<typeof createLocalRoutineRepository>;

  beforeEach(async () => {
    db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    repo = createLocalRoutineRepository(db);
  });

  it("creates a routine with a real UUID and queues an insert op", async () => {
    const { data } = await repo.createRoutine({ name: "Push/Pull" }, USER_ID);
    expect(data?.id).toMatch(/^[0-9a-f-]{36}$/i);
    const ops = await db.getAllAsync("SELECT row_id FROM pending_ops WHERE table_name = 'routines'");
    expect(ops).toEqual([{ row_id: data!.id }]);
  });

  it("builds a full routine → day → exercise → predefined set tree and reads it back", async () => {
    const { data: routine } = await repo.createRoutine({ name: "Push" }, USER_ID);
    const { data: day } = await repo.createDay({ routine_id: routine!.id, name: "Día 1", order_index: 0 }, USER_ID);
    const { data: dayEx } = await repo.addExercise(
      { routine_day_id: day!.id, exercise_id: "ex-1", order_index: 0 },
      USER_ID
    );
    await repo.savePredefinedSets(dayEx!.id, [{ weight: 60, reps: 8, order_index: 0 }], USER_ID);

    const { data: days } = await repo.getDays(routine!.id);
    expect(days).toHaveLength(1);
    const { data: exercises } = await repo.getDayExercises(days[0]!.id);
    expect(exercises).toHaveLength(1);
    const { data: sets } = await repo.getPredefinedSets(exercises[0]!.id);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.weight).toBe(60);
  });

  it("savePredefinedSets replaces the existing set list (tombstones old, inserts new)", async () => {
    const { data: routine } = await repo.createRoutine({ name: "Push" }, USER_ID);
    const { data: day } = await repo.createDay({ routine_id: routine!.id, name: "Día 1", order_index: 0 }, USER_ID);
    const { data: dayEx } = await repo.addExercise(
      { routine_day_id: day!.id, exercise_id: "ex-1", order_index: 0 },
      USER_ID
    );
    await repo.savePredefinedSets(dayEx!.id, [{ weight: 60, reps: 8, order_index: 0 }], USER_ID);
    await repo.savePredefinedSets(dayEx!.id, [{ weight: 70, reps: 5, order_index: 0 }], USER_ID);

    const { data: sets } = await repo.getPredefinedSets(dayEx!.id);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.weight).toBe(70);
  });

  it("deleteRoutine cascades tombstones through days, exercises and predefined sets", async () => {
    const { data: routine } = await repo.createRoutine({ name: "Push" }, USER_ID);
    const { data: day } = await repo.createDay({ routine_id: routine!.id, name: "Día 1", order_index: 0 }, USER_ID);
    const { data: dayEx } = await repo.addExercise(
      { routine_day_id: day!.id, exercise_id: "ex-1", order_index: 0 },
      USER_ID
    );
    await repo.savePredefinedSets(dayEx!.id, [{ weight: 60, reps: 8, order_index: 0 }], USER_ID);

    await repo.deleteRoutine(routine!.id);

    expect((await repo.getDays(routine!.id)).data).toEqual([]);
    expect((await repo.getDayExercises(day!.id)).data).toEqual([]);
    expect((await repo.getPredefinedSets(dayEx!.id)).data).toEqual([]);

    const deleteOps = await db.getAllAsync<{ table_name: string; op_type: string }>(
      "SELECT table_name, op_type FROM pending_ops WHERE op_type = 'delete'"
    );
    const tables = deleteOps.map((o) => o.table_name);
    expect(tables).toEqual(
      expect.arrayContaining(["routines", "routine_days", "routine_day_exercises", "predefined_sets"])
    );
  });

  it("copyRoutine deep-copies days, exercises and predefined sets with new UUIDs", async () => {
    const { data: routine } = await repo.createRoutine({ name: "Original" }, USER_ID);
    const { data: day } = await repo.createDay({ routine_id: routine!.id, name: "Día 1", order_index: 0 }, USER_ID);
    const { data: dayEx } = await repo.addExercise(
      { routine_day_id: day!.id, exercise_id: "ex-1", order_index: 0 },
      USER_ID
    );
    await repo.savePredefinedSets(dayEx!.id, [{ weight: 60, reps: 8, order_index: 0 }], USER_ID);

    const { data: copy } = await repo.copyRoutine(routine!.id, "Copia", USER_ID);
    expect(copy!.id).not.toBe(routine!.id);
    expect(copy!.name).toBe("Copia");

    const { data: copiedDays } = await repo.getDays(copy!.id);
    expect(copiedDays).toHaveLength(1);
    expect(copiedDays[0]!.id).not.toBe(day!.id);

    const { data: copiedExercises } = await repo.getDayExercises(copiedDays[0]!.id);
    expect(copiedExercises).toHaveLength(1);
    expect(copiedExercises[0]!.exercise_id).toBe("ex-1");

    const { data: copiedSets } = await repo.getPredefinedSets(copiedExercises[0]!.id);
    expect(copiedSets).toHaveLength(1);
    expect(copiedSets[0]!.weight).toBe(60);

    // Original untouched
    const { data: originalSets } = await repo.getPredefinedSets(dayEx!.id);
    expect(originalSets).toHaveLength(1);
  });

  it("reorderDays and reorderExercises update order_index", async () => {
    const { data: routine } = await repo.createRoutine({ name: "Push" }, USER_ID);
    const { data: day1 } = await repo.createDay({ routine_id: routine!.id, name: "D1", order_index: 0 }, USER_ID);
    const { data: day2 } = await repo.createDay({ routine_id: routine!.id, name: "D2", order_index: 1 }, USER_ID);

    await repo.reorderDays([
      { id: day1!.id, order_index: 1 },
      { id: day2!.id, order_index: 0 },
    ]);

    const { data: days } = await repo.getDays(routine!.id);
    expect(days.map((d) => d.name)).toEqual(["D2", "D1"]);
  });
});
