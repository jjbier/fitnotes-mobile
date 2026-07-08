import { ExerciseType } from "../types/index.js";
import type { Set } from "../types/index.js";

export interface ExerciseFields {
  weight: boolean;
  reps: boolean;
  distance: boolean;
  time: boolean;
}

export function getExerciseFields(type: ExerciseType): ExerciseFields {
  const w = [ExerciseType.WEIGHT_REPS, ExerciseType.WEIGHT_ONLY, ExerciseType.WEIGHT_DISTANCE, ExerciseType.WEIGHT_TIME].includes(type);
  const r = [ExerciseType.WEIGHT_REPS, ExerciseType.REPS_ONLY, ExerciseType.REPS_DISTANCE, ExerciseType.REPS_TIME].includes(type);
  const d = [ExerciseType.DISTANCE_TIME, ExerciseType.WEIGHT_DISTANCE, ExerciseType.REPS_DISTANCE, ExerciseType.DISTANCE_ONLY].includes(type);
  const t = [ExerciseType.DISTANCE_TIME, ExerciseType.TIME_ONLY, ExerciseType.WEIGHT_TIME, ExerciseType.REPS_TIME].includes(type);
  return { weight: w, reps: r, distance: d, time: t };
}

/** Fallback fields for when the exercise type isn't known yet (e.g. still loading). */
export const NO_EXERCISE_FIELDS: ExerciseFields = { weight: false, reps: false, distance: false, time: false };

/** Fallback fields for when every field should be shown regardless of exercise type. */
export const ALL_EXERCISE_FIELDS: ExerciseFields = { weight: true, reps: true, distance: true, time: true };

/** Formats a set's duration in seconds as "Xs", "Xmin" or "M:SS". */
export function formatSetTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}min` : `${m}:${String(s).padStart(2, "0")}`;
}

export interface SetFieldsInput {
  weight?: number;
  reps?: number;
  distance?: number;
  time_seconds?: number;
}

/** Formats a set's fields (weight/reps/distance/time) for display, e.g. "80 kg × 8 reps". */
export function formatSetDisplay(set: SetFieldsInput, type: ExerciseType, unit: string): string {
  const f = getExerciseFields(type);
  const parts: string[] = [];
  if (f.weight && set.weight != null) parts.push(`${set.weight} ${unit}`);
  if (f.reps && set.reps != null) parts.push(`${set.reps} reps`);
  if (f.distance && set.distance != null) parts.push(`${set.distance} km`);
  if (f.time && set.time_seconds != null) parts.push(formatSetTime(set.time_seconds));
  return parts.join(" × ") || "—";
}

/** Formats a duration in seconds as a clock: "MM:SS", or "H:MM:SS" once it reaches an hour. */
export function formatClockDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Formats a duration in seconds as "MM:SS" (no hours rollover). */
export function formatMinutesSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Formats a duration in seconds as "M:SS", minutes not zero-padded (used in progress charts). */
export function formatChartDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Default barbell plate denominations (kg) for the plate calculator. */
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

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
