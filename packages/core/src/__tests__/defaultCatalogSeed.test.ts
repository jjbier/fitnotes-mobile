import { describe, it, expect } from "vitest";
import { computeDefaultCatalogSeedPlan } from "../utils/defaultCatalogSeed.js";
import { ExerciseType } from "../types/index.js";
import type { DefaultCatalogCategory } from "../data/defaultExerciseCatalog.js";

const CATALOG: DefaultCatalogCategory[] = [
  {
    name: "Chest",
    exercises: [
      { name: "Flat Barbell Bench Press", type: ExerciseType.WEIGHT_REPS },
      { name: "Cable Crossover", type: ExerciseType.WEIGHT_REPS },
    ],
  },
  {
    name: "Cardio",
    exercises: [{ name: "Running (Outdoor)", type: ExerciseType.DISTANCE_TIME }],
  },
];

describe("computeDefaultCatalogSeedPlan", () => {
  it("plans to create everything when the user has nothing yet", () => {
    const plan = computeDefaultCatalogSeedPlan([], [], CATALOG);
    expect(plan.categoriesToCreateCount).toBe(2);
    expect(plan.categoriesSkippedCount).toBe(0);
    expect(plan.exercisesToCreateCount).toBe(3);
    expect(plan.exercisesSkippedCount).toBe(0);
    expect(plan.categories[0]).toEqual({
      name: "Chest",
      exists: false,
      exercisesToCreate: CATALOG[0]!.exercises,
      exercisesSkipped: 0,
    });
  });

  it("skips a category that already exists by name, case-insensitively", () => {
    const plan = computeDefaultCatalogSeedPlan(
      [{ id: "c1", name: "  chest  " }],
      [],
      CATALOG
    );
    expect(plan.categoriesToCreateCount).toBe(1);
    expect(plan.categoriesSkippedCount).toBe(1);
    // Exercises under the pre-existing category still need creating — the category existing alone doesn't seed its exercises.
    expect(plan.exercisesToCreateCount).toBe(3);
  });

  it("skips an exercise that already exists under the same category, case-insensitively", () => {
    const plan = computeDefaultCatalogSeedPlan(
      [{ id: "c1", name: "Chest" }],
      [{ name: "flat barbell bench press", category_id: "c1" }],
      CATALOG
    );
    const chestPlan = plan.categories.find((c) => c.name === "Chest")!;
    expect(chestPlan.exercisesSkipped).toBe(1);
    expect(chestPlan.exercisesToCreate).toEqual([CATALOG[0]!.exercises[1]]);
    expect(plan.exercisesToCreateCount).toBe(2); // Cable Crossover + Running (Outdoor)
    expect(plan.exercisesSkippedCount).toBe(1);
  });

  it("does not skip an exercise with the same name under a different category", () => {
    const plan = computeDefaultCatalogSeedPlan(
      [{ id: "c1", name: "Chest" }, { id: "c2", name: "Cardio" }],
      [{ name: "Running (Outdoor)", category_id: "c1" }], // same name, wrong category
      CATALOG
    );
    const cardioPlan = plan.categories.find((c) => c.name === "Cardio")!;
    expect(cardioPlan.exercisesToCreate).toEqual(CATALOG[1]!.exercises);
    expect(cardioPlan.exercisesSkipped).toBe(0);
  });

  it("reports nothing to create when everything already exists", () => {
    const plan = computeDefaultCatalogSeedPlan(
      [{ id: "c1", name: "Chest" }, { id: "c2", name: "Cardio" }],
      [
        { name: "Flat Barbell Bench Press", category_id: "c1" },
        { name: "Cable Crossover", category_id: "c1" },
        { name: "Running (Outdoor)", category_id: "c2" },
      ],
      CATALOG
    );
    expect(plan.categoriesToCreateCount).toBe(0);
    expect(plan.categoriesSkippedCount).toBe(2);
    expect(plan.exercisesToCreateCount).toBe(0);
    expect(plan.exercisesSkippedCount).toBe(3);
  });

  it("ignores existing exercises with no category (orphaned by a deleted category)", () => {
    const plan = computeDefaultCatalogSeedPlan(
      [{ id: "c1", name: "Chest" }],
      [{ name: "Flat Barbell Bench Press", category_id: null }],
      CATALOG
    );
    const chestPlan = plan.categories.find((c) => c.name === "Chest")!;
    expect(chestPlan.exercisesToCreate).toEqual(CATALOG[0]!.exercises);
  });

  it("defaults to the real catalog resolved in Spanish (8 categories, 96 exercises) when no catalog is passed", () => {
    const plan = computeDefaultCatalogSeedPlan([], []);
    expect(plan.categoriesToCreateCount).toBe(8);
    expect(plan.exercisesToCreateCount).toBe(96);
    // Spot-check a couple of real translated names, not just counts.
    expect(plan.categories.map((c) => c.name)).toContain("Pecho");
    expect(plan.categories.find((c) => c.name === "Pecho")!.exercisesToCreate.map((e) => e.name)).toContain("Cruce de poleas");
  });
});
