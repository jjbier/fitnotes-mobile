import { describe, it, expect } from "vitest";
import { dedupePersonalRecords, type DedupablePersonalRecord } from "../progressRepository.js";

function pr(overrides: Partial<DedupablePersonalRecord>): DedupablePersonalRecord {
  return { id: "id-1", exercise_id: "ex-1", reps: 8, weight: 80, achieved_at: "2026-07-17T00:00:00.000Z", ...overrides };
}

describe("dedupePersonalRecords", () => {
  it("returns rows unchanged when there is no duplicate (exercise_id, reps) pair", () => {
    const rows = [pr({ id: "a", reps: 5 }), pr({ id: "b", reps: 8 }), pr({ id: "c", exercise_id: "ex-2", reps: 8 })];
    expect(dedupePersonalRecords(rows)).toHaveLength(3);
  });

  it("keeps only the higher-weight row for a duplicate (exercise_id, reps) pair", () => {
    const rows = [pr({ id: "low", weight: 60 }), pr({ id: "high", weight: 80 })];
    const result = dedupePersonalRecords(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("high");
  });

  it("breaks a weight tie by the older achieved_at", () => {
    const rows = [
      pr({ id: "later", weight: 80, achieved_at: "2026-07-18T00:00:00.000Z" }),
      pr({ id: "earlier", weight: 80, achieved_at: "2026-07-17T00:00:00.000Z" }),
    ];
    const result = dedupePersonalRecords(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("earlier");
  });

  it("breaks a weight+achieved_at tie by the smaller id", () => {
    const rows = [pr({ id: "z-later" }), pr({ id: "a-earlier" })];
    const result = dedupePersonalRecords(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("a-earlier");
  });

  it("returns an empty array for an empty input", () => {
    expect(dedupePersonalRecords([])).toEqual([]);
  });
});
