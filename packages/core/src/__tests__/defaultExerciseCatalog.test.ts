import { describe, it, expect } from "vitest";
import { DEFAULT_EXERCISE_CATALOG_KEYS, resolveDefaultExerciseCatalog } from "../data/defaultExerciseCatalog.js";
import { es } from "../i18n/locales/es.js";
import { en } from "../i18n/locales/en.js";

describe("resolveDefaultExerciseCatalog", () => {
  it("resolves every key to a real translated name in Spanish", () => {
    const resolved = resolveDefaultExerciseCatalog(es.exerciseCatalog.categories, es.exerciseCatalog.exercises);
    expect(resolved).toHaveLength(DEFAULT_EXERCISE_CATALOG_KEYS.length);
    const chest = resolved.find((c) => c.name === "Pecho");
    expect(chest).toBeDefined();
    expect(chest!.exercises.map((e) => e.name)).toContain("Cruce de poleas");
  });

  it("resolves every key to a real translated name in English", () => {
    const resolved = resolveDefaultExerciseCatalog(en.exerciseCatalog.categories, en.exerciseCatalog.exercises);
    const chest = resolved.find((c) => c.name === "Chest");
    expect(chest).toBeDefined();
    expect(chest!.exercises.map((e) => e.name)).toContain("Cable Crossover");
  });

  it("falls back to the raw key when a translation is missing, instead of throwing", () => {
    const resolved = resolveDefaultExerciseCatalog({}, {});
    expect(resolved[0]!.name).toBe(DEFAULT_EXERCISE_CATALOG_KEYS[0]!.key);
    expect(resolved[0]!.exercises[0]!.name).toBe(DEFAULT_EXERCISE_CATALOG_KEYS[0]!.exercises[0]!.key);
  });

  it("preserves the exercise type unchanged through resolution", () => {
    const resolved = resolveDefaultExerciseCatalog(es.exerciseCatalog.categories, es.exerciseCatalog.exercises);
    const cardio = resolved.find((c) => c.name === "Cardio")!;
    expect(cardio.exercises.every((e) => e.type === "DISTANCE_TIME")).toBe(true);
  });

  it("keeps es and en translations in exact 1:1 correspondence with the key catalog (no missing/extra keys)", () => {
    const keyCategoryKeys = DEFAULT_EXERCISE_CATALOG_KEYS.map((c) => c.key).sort();
    const keyExerciseKeys = DEFAULT_EXERCISE_CATALOG_KEYS.flatMap((c) => c.exercises.map((e) => e.key)).sort();

    expect(Object.keys(es.exerciseCatalog.categories).sort()).toEqual(keyCategoryKeys);
    expect(Object.keys(en.exerciseCatalog.categories).sort()).toEqual(keyCategoryKeys);
    expect(Object.keys(es.exerciseCatalog.exercises).sort()).toEqual(keyExerciseKeys);
    expect(Object.keys(en.exerciseCatalog.exercises).sort()).toEqual(keyExerciseKeys);
  });
});
