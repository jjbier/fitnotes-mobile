import { describe, it, expect } from "vitest";
import { computePersonalRecordUpdate } from "../utils/personalRecords.js";

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
