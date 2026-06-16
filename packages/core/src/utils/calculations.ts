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
