import { describe, it, expect } from "vitest";
import { computePersonalRecordUpdate, recomputePersonalRecordLedger } from "../utils/personalRecords.js";

describe("computePersonalRecordUpdate", () => {
  it("returns a new PR when there is no previous record", () => {
    const result = computePersonalRecordUpdate({ isComplete: true, weight: 80, reps: 8 }, null);
    expect(result).toEqual({ reps: 8, weight: 80 });
  });

  it("returns a new PR when weight beats the current max for the same reps", () => {
    const result = computePersonalRecordUpdate({ isComplete: true, weight: 100, reps: 5 }, 90);
    expect(result).toEqual({ reps: 5, weight: 100 });
  });

  it("does not return a PR when weight is lower than the current max", () => {
    const result = computePersonalRecordUpdate({ isComplete: true, weight: 70, reps: 8 }, 90);
    expect(result).toBeNull();
  });

  it("does not return a PR when weight ties the current max", () => {
    const result = computePersonalRecordUpdate({ isComplete: true, weight: 90, reps: 8 }, 90);
    expect(result).toBeNull();
  });

  it("treats different rep counts as independent records", () => {
    const eightReps = computePersonalRecordUpdate({ isComplete: true, weight: 60, reps: 8 }, null);
    const fiveReps = computePersonalRecordUpdate({ isComplete: true, weight: 100, reps: 5 }, null);
    expect(eightReps).toEqual({ reps: 8, weight: 60 });
    expect(fiveReps).toEqual({ reps: 5, weight: 100 });
  });

  it("ignores incomplete sets", () => {
    const result = computePersonalRecordUpdate({ isComplete: false, weight: 200, reps: 5 }, null);
    expect(result).toBeNull();
  });

  it("ignores sets with a null weight", () => {
    const result = computePersonalRecordUpdate({ isComplete: true, weight: null, reps: 5 }, null);
    expect(result).toBeNull();
  });

  it("ignores sets with a null reps", () => {
    const result = computePersonalRecordUpdate({ isComplete: true, weight: 100, reps: null }, null);
    expect(result).toBeNull();
  });

  it("does not filter warmup sets — matches the SQL trigger's own gap", () => {
    const result = computePersonalRecordUpdate({ isComplete: true, weight: 50, reps: 12 }, null);
    expect(result).toEqual({ reps: 12, weight: 50 });
  });
});

describe("recomputePersonalRecordLedger", () => {
  it("keeps only the sets that would have generated a PR, in chronological order", () => {
    const ledger = recomputePersonalRecordLedger([
      { exercise_id: "bench", reps: 5, weight: 80, created_at: "2026-01-01T00:00:00Z" },
      { exercise_id: "bench", reps: 5, weight: 70, created_at: "2026-01-02T00:00:00Z" },
      { exercise_id: "bench", reps: 5, weight: 90, created_at: "2026-01-03T00:00:00Z" },
    ]);
    expect(ledger).toEqual([
      { exercise_id: "bench", reps: 5, weight: 80, achieved_at: "2026-01-01T00:00:00Z" },
      { exercise_id: "bench", reps: 5, weight: 90, achieved_at: "2026-01-03T00:00:00Z" },
    ]);
  });

  it("sorts unordered input by created_at before replaying", () => {
    const ledger = recomputePersonalRecordLedger([
      { exercise_id: "squat", reps: 5, weight: 100, created_at: "2026-01-03T00:00:00Z" },
      { exercise_id: "squat", reps: 5, weight: 80, created_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(ledger).toEqual([
      { exercise_id: "squat", reps: 5, weight: 80, achieved_at: "2026-01-01T00:00:00Z" },
      { exercise_id: "squat", reps: 5, weight: 100, achieved_at: "2026-01-03T00:00:00Z" },
    ]);
  });

  it("treats different rep counts and different exercises independently", () => {
    const ledger = recomputePersonalRecordLedger([
      { exercise_id: "bench", reps: 5, weight: 80, created_at: "2026-01-01T00:00:00Z" },
      { exercise_id: "bench", reps: 8, weight: 60, created_at: "2026-01-01T00:00:01Z" },
      { exercise_id: "squat", reps: 5, weight: 120, created_at: "2026-01-01T00:00:02Z" },
    ]);
    expect(ledger).toHaveLength(3);
  });

  it("effectively drops orphaned PRs when their originating set is excluded from the input", () => {
    // Simulates deleting the workout that had the 90kg set: only the 80kg set survives.
    const ledger = recomputePersonalRecordLedger([
      { exercise_id: "bench", reps: 5, weight: 80, created_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(ledger).toEqual([
      { exercise_id: "bench", reps: 5, weight: 80, achieved_at: "2026-01-01T00:00:00Z" },
    ]);
  });

  it("returns an empty ledger for no sets", () => {
    expect(recomputePersonalRecordLedger([])).toEqual([]);
  });
});
