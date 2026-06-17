import { describe, it, expect } from "vitest";
import {
  formatWorkoutDate,
  getWeekRange,
  groupWorkoutsByMonth,
  todayISO,
  daysBetween,
} from "../utils/dateUtils.js";
import type { Workout } from "../types/index.js";

// ─── formatWorkoutDate ────────────────────────────────────────────────────────

describe("formatWorkoutDate", () => {
  it("formats a Monday correctly", () => {
    // 2024-01-01 is a Monday
    expect(formatWorkoutDate("2024-01-01")).toBe("Mon, January 1, 2024");
  });

  it("formats a Saturday correctly", () => {
    // 2024-06-15 is a Saturday
    expect(formatWorkoutDate("2024-06-15")).toBe("Sat, June 15, 2024");
  });

  it("formats a Sunday correctly", () => {
    // 2024-12-22 is a Sunday
    expect(formatWorkoutDate("2024-12-22")).toBe("Sun, December 22, 2024");
  });

  it("returns the input string unchanged for invalid format", () => {
    expect(formatWorkoutDate("invalid")).toBe("invalid");
  });
});

// ─── getWeekRange ─────────────────────────────────────────────────────────────

describe("getWeekRange", () => {
  function parseDayOfWeek(dateStr: string): number {
    // Parse YYYY-MM-DD without timezone ambiguity
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y!, m! - 1, d!).getDay();
  }

  it("start is always a Monday (day 1)", () => {
    const { start } = getWeekRange("2024-06-19"); // Wednesday
    expect(parseDayOfWeek(start)).toBe(1);
  });

  it("end is always a Sunday (day 0)", () => {
    const { end } = getWeekRange("2024-06-19");
    expect(parseDayOfWeek(end)).toBe(0);
  });

  it("span is exactly 6 days (Mon–Sun)", () => {
    const { start, end } = getWeekRange("2024-06-19");
    expect(daysBetween(start, end)).toBe(6);
  });

  it("Monday input: start equals the same Monday", () => {
    const { start } = getWeekRange("2024-06-17"); // Monday
    expect(parseDayOfWeek(start)).toBe(1);
    expect(daysBetween(start, "2024-06-17")).toBe(0);
  });

  it("Sunday input is the last day of the week (end)", () => {
    const { start, end } = getWeekRange("2024-06-23"); // Sunday
    expect(parseDayOfWeek(end)).toBe(0);
    expect(daysBetween(start, end)).toBe(6);
  });

  it("returns input for invalid date string", () => {
    const { start, end } = getWeekRange("bad");
    expect(start).toBe("bad");
    expect(end).toBe("bad");
  });
});

// ─── groupWorkoutsByMonth ─────────────────────────────────────────────────────

describe("groupWorkoutsByMonth", () => {
  const makeWorkout = (date: string): Workout => ({
    id: date,
    date,
  });

  it("groups workouts by month label", () => {
    const workouts = [
      makeWorkout("2024-01-05"),
      makeWorkout("2024-01-20"),
      makeWorkout("2024-02-10"),
    ];
    const groups = groupWorkoutsByMonth(workouts);
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups["January 2024"]).toHaveLength(2);
    expect(groups["February 2024"]).toHaveLength(1);
  });

  it("returns empty object for empty input", () => {
    expect(groupWorkoutsByMonth([])).toEqual({});
  });

  it("skips workouts with invalid dates", () => {
    const groups = groupWorkoutsByMonth([{ id: "x", date: "invalid" }]);
    expect(Object.keys(groups)).toHaveLength(0);
  });
});

// ─── todayISO ─────────────────────────────────────────────────────────────────

describe("todayISO", () => {
  it("returns a string matching YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── daysBetween ──────────────────────────────────────────────────────────────

describe("daysBetween", () => {
  it("returns 0 for same date", () => {
    expect(daysBetween("2024-01-01", "2024-01-01")).toBe(0);
  });

  it("returns 1 for consecutive days", () => {
    expect(daysBetween("2024-01-01", "2024-01-02")).toBe(1);
  });

  it("returns negative for b before a", () => {
    expect(daysBetween("2024-01-05", "2024-01-01")).toBe(-4);
  });

  it("returns 366 for a leap year", () => {
    expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
  });
});
