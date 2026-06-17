import type { Set } from "../types/index.js";

/**
 * Brzycki one-rep max formula.
 * Accurate for reps 1–10; breaks down above 10 (denominator goes negative at reps>=37).
 */
export function calculate1RM(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  const denominator = 37 - reps;
  if (denominator <= 0) return weight; // guard against Brzycki singularity
  return weight * (36 / denominator);
}

/** Estimate the weight achievable for a given rep count from a known 1RM. */
export function estimateRepMax(oneRM: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return oneRM;
  const denominator = 37 - reps;
  if (denominator <= 0) return oneRM;
  // Invert Brzycki: w = 1RM / (36 / (37 - reps)) = 1RM * (37 - reps) / 36
  return oneRM * (denominator / 36);
}

/** Total volume (sum of weight × reps) across all completed sets. */
export function calculateVolume(sets: Set[]): number {
  return sets.reduce((total, s) => {
    if (!s.is_complete) return total;
    return total + (s.weight ?? 0) * (s.reps ?? 0);
  }, 0);
}

/** Pace in seconds per kilometre. Returns 0 if inputs are invalid. */
export function calculatePace(
  distanceKm: number,
  timeSeconds: number
): number {
  if (distanceKm <= 0) return 0;
  return timeSeconds / distanceKm;
}

/** Speed in km/h. Returns 0 if inputs are invalid. */
export function calculateSpeed(
  distanceKm: number,
  timeSeconds: number
): number {
  if (timeSeconds <= 0) return 0;
  return (distanceKm / timeSeconds) * 3600;
}

/** Round `value` to the nearest `increment`. */
export function roundToNearest(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

/** Percentage of base weight, rounded to the nearest increment (default 2.5). */
export function calculateSetWeight(
  baseWeight: number,
  percentage: number,
  roundIncrement = 2.5
): number {
  return roundToNearest(baseWeight * (percentage / 100), roundIncrement);
}

/**
 * Greedy plate calculator: returns plates per side (largest first) needed to
 * reach `targetWeight` given `barWeight` and the available plate denominations.
 */
export function calculatePlates(
  targetWeight: number,
  barWeight: number,
  availablePlates: number[]
): number[] {
  const perSide = (targetWeight - barWeight) / 2;
  if (perSide <= 0) return [];
  const plates: number[] = [];
  let remaining = perSide;
  const sorted = [...availablePlates].sort((a, b) => b - a);
  for (const plate of sorted) {
    while (remaining >= plate - 0.001) {
      plates.push(plate);
      remaining -= plate;
      remaining = Math.round(remaining * 1000) / 1000;
    }
  }
  return plates;
}
