import { describe, it, expect, beforeEach } from "vitest";
import { useExerciseStore } from "../stores/exerciseStore.js";
import { ExerciseType } from "../types/index.js";
import type { Category, Exercise } from "../types/index.js";

const CAT: Category = { id: "cat1", name: "Chest", color: "#ff0000", order_index: 0 };
const CAT2: Category = { id: "cat2", name: "Back", color: "#0000ff", order_index: 1 };

const EX: Exercise = {
  id: "ex1",
  name: "Bench Press",
  category_id: "cat1",
  type: ExerciseType.WEIGHT_REPS,
  weight_unit: "kg",
  is_favorite: false,
  created_at: "2024-01-01T00:00:00.000Z",
};

beforeEach(() => {
  useExerciseStore.setState({
    categories: [],
    exercises: [],
    favorites: [],
    isLoading: false,
    error: null,
  });
});

// ─── loadCategories ───────────────────────────────────────────────────────────

describe("loadCategories", () => {
  it("replaces categories array", () => {
    useExerciseStore.getState().loadCategories([CAT, CAT2]);
    expect(useExerciseStore.getState().categories).toHaveLength(2);
  });
});

// ─── loadExercises ────────────────────────────────────────────────────────────

describe("loadExercises", () => {
  it("sets categories and exercises, populates favorites", () => {
    const favEx = { ...EX, id: "ex2", is_favorite: true };
    useExerciseStore.getState().loadExercises([CAT], [EX, favEx]);
    const state = useExerciseStore.getState();
    expect(state.exercises).toHaveLength(2);
    expect(state.favorites).toContain("ex2");
    expect(state.favorites).not.toContain("ex1");
  });
});

// ─── addExercise ──────────────────────────────────────────────────────────────

describe("addExercise [T1.1]", () => {
  it("appends exercise to the exercises array", () => {
    useExerciseStore.getState().addExercise(EX);
    expect(useExerciseStore.getState().exercises).toHaveLength(1);
    expect(useExerciseStore.getState().exercises[0]!.id).toBe("ex1");
  });

  it("adds to favorites when is_favorite is true", () => {
    useExerciseStore.getState().addExercise({ ...EX, is_favorite: true });
    expect(useExerciseStore.getState().favorites).toContain("ex1");
  });
});

// ─── updateExercise ───────────────────────────────────────────────────────────

describe("updateExercise [T1.3]", () => {
  it("updates name and notes", () => {
    useExerciseStore.getState().addExercise(EX);
    useExerciseStore.getState().updateExercise("ex1", { name: "Incline Bench", notes: "Keep elbows in" });
    const ex = useExerciseStore.getState().exercises[0]!;
    expect(ex.name).toBe("Incline Bench");
    expect(ex.notes).toBe("Keep elbows in");
  });

  it("does nothing for unknown id", () => {
    useExerciseStore.getState().addExercise(EX);
    useExerciseStore.getState().updateExercise("no-such-id", { name: "X" });
    expect(useExerciseStore.getState().exercises[0]!.name).toBe("Bench Press");
  });
});

// ─── deleteExercise ───────────────────────────────────────────────────────────

describe("deleteExercise [T1.2]", () => {
  it("removes exercise from state", () => {
    useExerciseStore.getState().addExercise(EX);
    expect(useExerciseStore.getState().exercises).toHaveLength(1);
    useExerciseStore.getState().deleteExercise("ex1");
    expect(useExerciseStore.getState().exercises).toHaveLength(0);
  });

  it("also removes from favorites", () => {
    useExerciseStore.getState().addExercise({ ...EX, is_favorite: true });
    expect(useExerciseStore.getState().favorites).toContain("ex1");
    useExerciseStore.getState().deleteExercise("ex1");
    expect(useExerciseStore.getState().favorites).not.toContain("ex1");
  });
});

// ─── toggleFavorite ───────────────────────────────────────────────────────────

describe("toggleFavorite [T1.3]", () => {
  it("adds to favorites when not already a favorite", () => {
    useExerciseStore.getState().addExercise(EX);
    useExerciseStore.getState().toggleFavorite("ex1");
    expect(useExerciseStore.getState().favorites).toContain("ex1");
    expect(useExerciseStore.getState().exercises[0]!.is_favorite).toBe(true);
  });

  it("removes from favorites when already a favorite", () => {
    useExerciseStore.getState().addExercise({ ...EX, is_favorite: true });
    useExerciseStore.getState().toggleFavorite("ex1");
    expect(useExerciseStore.getState().favorites).not.toContain("ex1");
    expect(useExerciseStore.getState().exercises[0]!.is_favorite).toBe(false);
  });
});

// ─── addCategory / updateCategory / deleteCategory ────────────────────────────

describe("addCategory", () => {
  it("appends category to categories", () => {
    useExerciseStore.getState().addCategory(CAT);
    expect(useExerciseStore.getState().categories).toHaveLength(1);
  });
});

describe("updateCategory", () => {
  it("updates category name and color", () => {
    useExerciseStore.getState().addCategory(CAT);
    useExerciseStore.getState().updateCategory("cat1", { name: "Arms", color: "#00ff00" });
    const c = useExerciseStore.getState().categories[0]!;
    expect(c.name).toBe("Arms");
    expect(c.color).toBe("#00ff00");
  });
});

describe("deleteCategory", () => {
  it("removes category and its exercises", () => {
    useExerciseStore.getState().addCategory(CAT);
    useExerciseStore.getState().addExercise(EX); // belongs to cat1
    useExerciseStore.getState().addExercise({ ...EX, id: "ex2", category_id: "cat2" });
    useExerciseStore.getState().deleteCategory("cat1");
    const state = useExerciseStore.getState();
    expect(state.categories).toHaveLength(0);
    expect(state.exercises).toHaveLength(1);
    expect(state.exercises[0]!.id).toBe("ex2");
  });
});

// ─── reorderCategories ────────────────────────────────────────────────────────

describe("reorderCategories", () => {
  it("reorders categories by the given id order", () => {
    useExerciseStore.getState().loadCategories([CAT, CAT2]);
    useExerciseStore.getState().reorderCategories(["cat2", "cat1"]);
    const cats = useExerciseStore.getState().categories;
    expect(cats[0]!.id).toBe("cat2");
    expect(cats[0]!.order_index).toBe(0);
    expect(cats[1]!.id).toBe("cat1");
    expect(cats[1]!.order_index).toBe(1);
  });
});

// ─── setLoading / setError ────────────────────────────────────────────────────

describe("setLoading / setError", () => {
  it("setLoading toggles isLoading", () => {
    useExerciseStore.getState().setLoading(true);
    expect(useExerciseStore.getState().isLoading).toBe(true);
  });

  it("setError sets error string", () => {
    useExerciseStore.getState().setError("fetch failed");
    expect(useExerciseStore.getState().error).toBe("fetch failed");
    useExerciseStore.getState().setError(null);
    expect(useExerciseStore.getState().error).toBeNull();
  });
});
