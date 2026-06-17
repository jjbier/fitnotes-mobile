import { describe, it, expect, beforeEach } from "vitest";
import { useWorkoutStore } from "../stores/workoutStore.js";
import type { Workout, WorkoutExercise, Set } from "../types/index.js";

const WORKOUT: Workout = { id: "w1", date: "2024-06-01" };
const WE: WorkoutExercise = { id: "we1", workout_id: "w1", exercise_id: "ex1", order_index: 0 };
const SETS: Record<string, Set[]> = {
  we1: [
    { id: "s1", workout_exercise_id: "we1", weight: 100, reps: 5, is_complete: false, order_index: 0 },
  ],
};

beforeEach(() => {
  useWorkoutStore.getState().resetWorkout();
});

// ─── Initial state ─────────────────────────────────────────────────────────────

describe("initial state", () => {
  it("has no active workout", () => {
    expect(useWorkoutStore.getState().activeWorkout).toBeNull();
  });

  it("has empty exercises list", () => {
    expect(useWorkoutStore.getState().exercises).toEqual([]);
  });

  it("has empty sets map", () => {
    expect(useWorkoutStore.getState().sets).toEqual({});
  });

  it("isLoading is false", () => {
    expect(useWorkoutStore.getState().isLoading).toBe(false);
  });

  it("error is null", () => {
    expect(useWorkoutStore.getState().error).toBeNull();
  });
});

// ─── loadWorkout ──────────────────────────────────────────────────────────────

describe("loadWorkout", () => {
  it("sets activeWorkout, exercises, and sets", () => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], SETS);
    const state = useWorkoutStore.getState();
    expect(state.activeWorkout).toEqual(WORKOUT);
    expect(state.exercises).toHaveLength(1);
    expect(state.sets["we1"]).toHaveLength(1);
    expect(state.currentDate).toBe("2024-06-01");
  });
});

// ─── startWorkout ─────────────────────────────────────────────────────────────

describe("startWorkout", () => {
  it("creates a new workout with the given date", () => {
    useWorkoutStore.getState().startWorkout("2024-07-01");
    const state = useWorkoutStore.getState();
    expect(state.activeWorkout).not.toBeNull();
    expect(state.activeWorkout!.date).toBe("2024-07-01");
    expect(state.exercises).toHaveLength(0);
  });
});

// ─── addExerciseToWorkout ─────────────────────────────────────────────────────

describe("addExerciseToWorkout", () => {
  it("appends a WorkoutExercise and initialises empty sets array", () => {
    useWorkoutStore.getState().startWorkout("2024-06-01");
    useWorkoutStore.getState().addExerciseToWorkout("ex-bench");
    const state = useWorkoutStore.getState();
    expect(state.exercises).toHaveLength(1);
    expect(state.exercises[0]!.exercise_id).toBe("ex-bench");
    const weId = state.exercises[0]!.id;
    expect(state.sets[weId]).toEqual([]);
  });

  it("does nothing when there is no active workout", () => {
    useWorkoutStore.getState().addExerciseToWorkout("ex-bench");
    expect(useWorkoutStore.getState().exercises).toHaveLength(0);
  });
});

// ─── createSet / updateSet / deleteSet ────────────────────────────────────────

describe("createSet [T3.1]", () => {
  it("adds a set to the correct workoutExercise", () => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], { we1: [] });
    useWorkoutStore.getState().createSet("we1", { weight: 80, reps: 8 });
    const sets = useWorkoutStore.getState().sets["we1"]!;
    expect(sets).toHaveLength(1);
    expect(sets[0]!.weight).toBe(80);
    expect(sets[0]!.reps).toBe(8);
    expect(sets[0]!.is_complete).toBe(false);
  });

  it("creates multiple sets in order", () => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], { we1: [] });
    useWorkoutStore.getState().createSet("we1", { weight: 80 });
    useWorkoutStore.getState().createSet("we1", { weight: 90 });
    expect(useWorkoutStore.getState().sets["we1"]).toHaveLength(2);
  });
});

describe("updateSet [T3.2]", () => {
  it("updates weight and reps correctly", () => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], SETS);
    useWorkoutStore.getState().updateSet("we1", "s1", { weight: 120, reps: 3 });
    const s = useWorkoutStore.getState().sets["we1"]![0]!;
    expect(s.weight).toBe(120);
    expect(s.reps).toBe(3);
  });

  it("does nothing for unknown setId", () => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], SETS);
    useWorkoutStore.getState().updateSet("we1", "no-such-id", { weight: 999 });
    expect(useWorkoutStore.getState().sets["we1"]![0]!.weight).toBe(100);
  });
});

describe("deleteSet [T3.3]", () => {
  it("removes the set; count decreases", () => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], SETS);
    expect(useWorkoutStore.getState().sets["we1"]).toHaveLength(1);
    useWorkoutStore.getState().deleteSet("we1", "s1");
    expect(useWorkoutStore.getState().sets["we1"]).toHaveLength(0);
  });
});

// ─── markSetComplete ──────────────────────────────────────────────────────────

describe("markSetComplete", () => {
  it("marks a set as complete", () => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], SETS);
    useWorkoutStore.getState().markSetComplete("we1", "s1", true);
    expect(useWorkoutStore.getState().sets["we1"]![0]!.is_complete).toBe(true);
  });

  it("marks a set as incomplete", () => {
    const completeSets: Record<string, Set[]> = {
      we1: [{ id: "s1", workout_exercise_id: "we1", is_complete: true, order_index: 0 }],
    };
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], completeSets);
    useWorkoutStore.getState().markSetComplete("we1", "s1", false);
    expect(useWorkoutStore.getState().sets["we1"]![0]!.is_complete).toBe(false);
  });
});

// ─── groupExercises / ungroupExercise ─────────────────────────────────────────

describe("groupExercises / ungroupExercise", () => {
  it("assigns same group_id to both exercises", () => {
    const WE2: WorkoutExercise = { id: "we2", workout_id: "w1", exercise_id: "ex2", order_index: 1 };
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE, WE2], { we1: [], we2: [] });
    useWorkoutStore.getState().groupExercises("we1", "we2");
    const state = useWorkoutStore.getState();
    const g1 = state.exercises.find((e) => e.id === "we1")!.group_id;
    const g2 = state.exercises.find((e) => e.id === "we2")!.group_id;
    expect(g1).toBeDefined();
    expect(g1).toBe(g2);
  });

  it("ungroupExercise clears group_id for that exercise", () => {
    const WE2: WorkoutExercise = { id: "we2", workout_id: "w1", exercise_id: "ex2", order_index: 1 };
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE, WE2], { we1: [], we2: [] });
    useWorkoutStore.getState().groupExercises("we1", "we2");
    useWorkoutStore.getState().ungroupExercise("we1");
    const ex = useWorkoutStore.getState().exercises.find((e) => e.id === "we1")!;
    expect(ex.group_id).toBeUndefined();
  });
});

// ─── setWorkoutComment ────────────────────────────────────────────────────────

describe("setWorkoutComment", () => {
  it("sets comment on the active workout", () => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [], {});
    useWorkoutStore.getState().setWorkoutComment("Great session");
    expect(useWorkoutStore.getState().activeWorkout!.comment).toBe("Great session");
  });
});

// ─── setLoading / setError ────────────────────────────────────────────────────

describe("setLoading / setError", () => {
  it("setLoading toggles isLoading", () => {
    useWorkoutStore.getState().setLoading(true);
    expect(useWorkoutStore.getState().isLoading).toBe(true);
    useWorkoutStore.getState().setLoading(false);
    expect(useWorkoutStore.getState().isLoading).toBe(false);
  });

  it("setError sets the error message", () => {
    useWorkoutStore.getState().setError("Something went wrong");
    expect(useWorkoutStore.getState().error).toBe("Something went wrong");
    useWorkoutStore.getState().setError(null);
    expect(useWorkoutStore.getState().error).toBeNull();
  });
});

// ─── loadWorkouts / addWorkoutToHistory ───────────────────────────────────────

describe("loadWorkouts / addWorkoutToHistory", () => {
  it("loadWorkouts replaces the workouts array", () => {
    const list = [WORKOUT, { id: "w2", date: "2024-06-02" }];
    useWorkoutStore.getState().loadWorkouts(list);
    expect(useWorkoutStore.getState().workouts).toHaveLength(2);
  });

  it("addWorkoutToHistory prepends a new workout", () => {
    useWorkoutStore.getState().loadWorkouts([WORKOUT]);
    const w2: Workout = { id: "w2", date: "2024-06-02" };
    useWorkoutStore.getState().addWorkoutToHistory(w2);
    expect(useWorkoutStore.getState().workouts[0]!.id).toBe("w2");
  });

  it("addWorkoutToHistory does not duplicate", () => {
    useWorkoutStore.getState().loadWorkouts([WORKOUT]);
    useWorkoutStore.getState().addWorkoutToHistory(WORKOUT);
    expect(useWorkoutStore.getState().workouts).toHaveLength(1);
  });
});
