import type { Exercise } from "../types/index.js";

/**
 * Partial multi-word search: "dum press" matches "Dumbbell Press".
 * Each whitespace-separated term must appear somewhere in the name.
 */
export function filterExercises(exercises: Exercise[], query: string): Exercise[] {
  const q = query.trim();
  if (!q) return exercises;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return exercises.filter((ex) =>
    terms.every((term) => ex.name.toLowerCase().includes(term))
  );
}
