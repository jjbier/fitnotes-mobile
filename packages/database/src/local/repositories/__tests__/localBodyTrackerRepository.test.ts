import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalBodyTrackerRepository } from "../localBodyTrackerRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";

const USER_ID = "user-1";

describe("localBodyTrackerRepository", () => {
  let db: SqlExecutor;
  let repo: ReturnType<typeof createLocalBodyTrackerRepository>;

  beforeEach(async () => {
    db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    repo = createLocalBodyTrackerRepository(db);
  });

  it("seeds default measurements only once", async () => {
    const first = await repo.seedDefaultMeasurementsIfNeeded(USER_ID);
    expect(first.seeded).toBe(true);
    const second = await repo.seedDefaultMeasurementsIfNeeded(USER_ID);
    expect(second.seeded).toBe(false);

    const { data } = await repo.getMeasurements();
    expect(data.map((m) => m.name).sort()).toEqual(["Grasa corporal", "Peso corporal"]);
    expect(data.every((m) => m.is_default)).toBe(true);
  });

  it("creates a measurement with a real UUID and queues an insert op", async () => {
    const { data, error } = await repo.createMeasurement({ name: "Cintura", unit: "cm" }, USER_ID);
    expect(error).toBeNull();
    expect(data?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(data?.is_default).toBe(false);

    const ops = await db.getAllAsync("SELECT row_id FROM pending_ops WHERE table_name = 'body_measurements'");
    expect(ops).toEqual([{ row_id: data!.id }]);
  });

  it("addEntry then getEntries returns newest first", async () => {
    const { data: m } = await repo.createMeasurement({ name: "Peso", unit: "kg" }, USER_ID);
    await repo.addEntry({ measurement_id: m!.id, value: 80, recorded_at: "2026-01-01T00:00:00Z" }, USER_ID);
    await repo.addEntry({ measurement_id: m!.id, value: 79, recorded_at: "2026-01-02T00:00:00Z" }, USER_ID);

    const { data } = await repo.getEntries(m!.id);
    expect(data.map((e) => e.value)).toEqual([79, 80]);
  });

  it("deleteMeasurement cascades to its entries (tombstone)", async () => {
    const { data: m } = await repo.createMeasurement({ name: "Peso", unit: "kg" }, USER_ID);
    const { data: entry } = await repo.addEntry({ measurement_id: m!.id, value: 80 }, USER_ID);

    await repo.deleteMeasurement(m!.id);

    const { data: measurements } = await repo.getMeasurements();
    expect(measurements).toEqual([]);
    const row = await db.getFirstAsync<{ _deleted: number }>(
      "SELECT _deleted FROM body_measurement_entries WHERE id = ?",
      [entry!.id]
    );
    expect(row?._deleted).toBe(1);
    const deleteOp = await db.getFirstAsync(
      "SELECT * FROM pending_ops WHERE table_name = 'body_measurement_entries' AND op_type = 'delete' AND row_id = ?",
      [entry!.id]
    );
    expect(deleteOp).not.toBeNull();
  });

  it("resetMeasurement tombstones all entries but keeps the measurement", async () => {
    const { data: m } = await repo.createMeasurement({ name: "Peso", unit: "kg" }, USER_ID);
    await repo.addEntry({ measurement_id: m!.id, value: 80 }, USER_ID);

    await repo.resetMeasurement(m!.id);

    const { data: entries } = await repo.getEntries(m!.id);
    expect(entries).toEqual([]);
    const { data: measurements } = await repo.getMeasurements();
    expect(measurements).toHaveLength(1);
  });

  it("reorderMeasurements returns one result per update", async () => {
    const { data: a } = await repo.createMeasurement({ name: "A", unit: "cm" }, USER_ID);
    const { data: b } = await repo.createMeasurement({ name: "B", unit: "cm" }, USER_ID);

    const results = await repo.reorderMeasurements([
      { id: a!.id, order_index: 1 },
      { id: b!.id, order_index: 0 },
    ]);
    expect(results).toEqual([{ error: null }, { error: null }]);

    const { data } = await repo.getMeasurements();
    expect(data.map((m) => m.name)).toEqual(["B", "A"]);
  });
});
