import { describe, it, expect } from "vitest";
import {
  calculate1RM,
  estimateRepMax,
  calculateVolume,
  calculatePace,
  calculateSpeed,
  roundToNearest,
  calculateSetWeight,
  calculatePlates,
} from "../utils/calculations.js";
import type { Set } from "../types/index.js";

// ─── calculate1RM ─────────────────────────────────────────────────────────────

describe("calculate1RM", () => {
  it("[T4.1] returns 112.5 for 100kg × 5 reps (Brzycki: 100 * 36/32)", () => {
    // Brzycki: weight * 36 / (37 - reps) = 100 * 36 / 32 = 112.5
    expect(calculate1RM(100, 5)).toBeCloseTo(112.5, 1);
  });

  it("returns weight unchanged for 1 rep", () => {
    expect(calculate1RM(80, 1)).toBe(80);
  });

  it("returns 0 for 0 weight", () => {
    expect(calculate1RM(0, 5)).toBe(0);
  });

  it("returns 0 for 0 reps", () => {
    expect(calculate1RM(100, 0)).toBe(0);
  });

  it("returns 0 for negative reps", () => {
    expect(calculate1RM(100, -1)).toBe(0);
  });

  it("guards against singularity at reps >= 37 (returns weight)", () => {
    expect(calculate1RM(100, 37)).toBe(100);
    expect(calculate1RM(100, 40)).toBe(100);
  });

  it("is monotonically increasing: more reps at same weight → higher estimated 1RM", () => {
    // More reps at same weight means you're stronger → higher 1RM
    const rm5 = calculate1RM(100, 5);   // 112.5
    const rm10 = calculate1RM(100, 10); // 133.33
    expect(rm10).toBeGreaterThan(rm5);
  });
});

// ─── estimateRepMax ───────────────────────────────────────────────────────────

describe("estimateRepMax", () => {
  it("returns oneRM unchanged for 1 rep", () => {
    expect(estimateRepMax(120, 1)).toBe(120);
  });

  it("returns 0 for 0 reps", () => {
    expect(estimateRepMax(120, 0)).toBe(0);
  });

  it("is inverse of calculate1RM", () => {
    const oneRM = calculate1RM(100, 5);
    const fiveRM = estimateRepMax(oneRM, 5);
    expect(fiveRM).toBeCloseTo(100, 0);
  });

  it("returns lower weight for higher rep counts", () => {
    const rm5 = estimateRepMax(120, 5);
    const rm10 = estimateRepMax(120, 10);
    expect(rm5).toBeGreaterThan(rm10);
  });
});

// ─── calculateVolume ──────────────────────────────────────────────────────────

describe("calculateVolume", () => {
  const makeSet = (weight: number, reps: number, is_complete: boolean): Set => ({
    id: "s1",
    workout_exercise_id: "we1",
    weight,
    reps,
    is_complete,
    is_warmup: false,
    order_index: 0,
  });

  it("[T4.2] counts only completed sets", () => {
    const sets: Set[] = [
      makeSet(100, 5, true),
      makeSet(100, 5, false),
    ];
    expect(calculateVolume(sets)).toBe(500);
  });

  it("returns 0 for empty array", () => {
    expect(calculateVolume([])).toBe(0);
  });

  it("returns 0 when all sets are incomplete", () => {
    expect(calculateVolume([makeSet(100, 5, false)])).toBe(0);
  });

  it("sums multiple complete sets correctly", () => {
    const sets: Set[] = [
      makeSet(100, 5, true),
      makeSet(80, 8, true),
      makeSet(60, 10, true),
    ];
    expect(calculateVolume(sets)).toBe(100 * 5 + 80 * 8 + 60 * 10);
  });

  it("treats undefined weight/reps as 0", () => {
    const s: Set = { id: "x", workout_exercise_id: "we", is_complete: true, is_warmup: false, order_index: 0 };
    expect(calculateVolume([s])).toBe(0);
  });
});

// ─── calculatePace ────────────────────────────────────────────────────────────

describe("calculatePace", () => {
  it("returns seconds per km", () => {
    expect(calculatePace(10, 3600)).toBe(360);
  });

  it("returns 0 for 0 distance", () => {
    expect(calculatePace(0, 3600)).toBe(0);
  });

  it("returns 0 for negative distance", () => {
    expect(calculatePace(-1, 3600)).toBe(0);
  });
});

// ─── calculateSpeed ───────────────────────────────────────────────────────────

describe("calculateSpeed", () => {
  it("[T4.3] returns 10 km/h for 10 km in 3600 s", () => {
    expect(calculateSpeed(10, 3600)).toBe(10);
  });

  it("returns 0 for 0 time", () => {
    expect(calculateSpeed(10, 0)).toBe(0);
  });

  it("returns 0 for negative time", () => {
    expect(calculateSpeed(10, -1)).toBe(0);
  });
});

// ─── roundToNearest ───────────────────────────────────────────────────────────

describe("roundToNearest", () => {
  it("[T6.4] rounds 73 down to 72.5 for increment 2.5", () => {
    expect(roundToNearest(73, 2.5)).toBe(72.5);
  });

  it("rounds 74 up to 75 for increment 2.5", () => {
    expect(roundToNearest(74, 2.5)).toBe(75);
  });

  it("returns value unchanged for increment 0 (guard)", () => {
    expect(roundToNearest(73, 0)).toBe(73);
  });

  it("returns value unchanged for negative increment (guard)", () => {
    expect(roundToNearest(73, -2.5)).toBe(73);
  });

  it("rounds to nearest 5", () => {
    expect(roundToNearest(102, 5)).toBe(100);
    expect(roundToNearest(103, 5)).toBe(105);
  });

  it("exact multiples are unchanged", () => {
    expect(roundToNearest(100, 2.5)).toBe(100);
  });
});

// ─── calculateSetWeight ───────────────────────────────────────────────────────

describe("calculateSetWeight", () => {
  it("[T6.3] 75% of 100 kg rounds to 75 (default 2.5 increment)", () => {
    expect(calculateSetWeight(100, 75)).toBe(75);
  });

  it("67% of 100 kg → 67 rounded to nearest 2.5 = 67.5", () => {
    expect(calculateSetWeight(100, 67)).toBe(67.5);
  });

  it("uses custom increment", () => {
    expect(calculateSetWeight(100, 75, 5)).toBe(75);
    expect(calculateSetWeight(100, 67, 5)).toBe(65);
  });

  it("50% of 80 kg = 40 kg", () => {
    expect(calculateSetWeight(80, 50)).toBe(40);
  });
});

// ─── calculatePlates ─────────────────────────────────────────────────────────

describe("calculatePlates", () => {
  const STANDARD = [25, 20, 15, 10, 5, 2.5, 1.25];

  it("[T6.1] 100 kg on 20 kg bar → plates per side sum to 40 kg", () => {
    // Greedy: 25+15 = 40, or 20+20 = 40, depending on available plates
    const plates = calculatePlates(100, 20, STANDARD);
    const totalPerSide = plates.reduce((s, p) => s + p, 0);
    expect(totalPerSide).toBeCloseTo(40, 5);
    expect(plates.length).toBeGreaterThan(0);
  });

  it("[T6.2] target equals bar → empty (no plates needed)", () => {
    expect(calculatePlates(20, 20, STANDARD)).toEqual([]);
  });

  it("target below bar → empty", () => {
    expect(calculatePlates(15, 20, STANDARD)).toEqual([]);
  });

  it("25 kg on 20 kg bar with only 2.5 kg plates → [2.5] per side", () => {
    const plates = calculatePlates(25, 20, [2.5]);
    expect(plates).toEqual([2.5]);
  });

  it("returns plates largest-first", () => {
    const plates = calculatePlates(120, 20, STANDARD);
    for (let i = 1; i < plates.length; i++) {
      expect(plates[i]!).toBeLessThanOrEqual(plates[i - 1]!);
    }
  });

  it("handles fractional weights (60 kg on 20 kg bar)", () => {
    const plates = calculatePlates(60, 20, STANDARD);
    const totalPerSide = plates.reduce((s, p) => s + p, 0);
    expect(totalPerSide).toBeCloseTo(20, 5);
  });
});
