import { describe, it, expect, beforeEach } from "vitest";
import { useRoutineStore } from "../stores/routineStore.js";
import type { Routine, RoutineDay, RoutineDayExercise, PredefinedSet } from "../types/index.js";

const ROUTINE: Routine = { id: "r1", name: "Push Day" };
const ROUTINE2: Routine = { id: "r2", name: "Pull Day" };

const DAY: RoutineDay = { id: "d1", routine_id: "r1", name: "Monday", order_index: 0 };
const DAY2: RoutineDay = { id: "d2", routine_id: "r1", name: "Thursday", order_index: 1 };

const RDE: RoutineDayExercise = {
  id: "rde1",
  routine_day_id: "d1",
  exercise_id: "ex1",
  order_index: 0,
};

beforeEach(() => {
  useRoutineStore.setState({
    routines: [],
    routineDays: {},
    routineDayExercises: {},
    predefinedSets: {},
    activeRoutineId: null,
    isLoading: false,
    error: null,
  });
});

// ─── createRoutine ────────────────────────────────────────────────────────────

describe("createRoutine [T2.1]", () => {
  it("adds routine to state with unique ID", () => {
    useRoutineStore.getState().createRoutine(ROUTINE);
    const state = useRoutineStore.getState();
    expect(state.routines).toHaveLength(1);
    expect(state.routines[0]!.id).toBe("r1");
  });

  it("initialises empty days array for the new routine", () => {
    useRoutineStore.getState().createRoutine(ROUTINE);
    expect(useRoutineStore.getState().routineDays["r1"]).toEqual([]);
  });
});

// ─── updateRoutine ────────────────────────────────────────────────────────────

describe("updateRoutine", () => {
  it("updates name and notes", () => {
    useRoutineStore.getState().createRoutine(ROUTINE);
    useRoutineStore.getState().updateRoutine("r1", { name: "Push/Pull", notes: "Heavy week" });
    const r = useRoutineStore.getState().routines[0]!;
    expect(r.name).toBe("Push/Pull");
    expect(r.notes).toBe("Heavy week");
  });
});

// ─── deleteRoutine ────────────────────────────────────────────────────────────

describe("deleteRoutine", () => {
  it("removes the routine from state", () => {
    useRoutineStore.getState().createRoutine(ROUTINE);
    useRoutineStore.getState().createRoutine(ROUTINE2);
    useRoutineStore.getState().deleteRoutine("r1");
    const routines = useRoutineStore.getState().routines;
    expect(routines).toHaveLength(1);
    expect(routines[0]!.id).toBe("r2");
  });

  it("cleans up days and exercises for the deleted routine", () => {
    useRoutineStore.getState().createRoutine(ROUTINE);
    useRoutineStore.getState().addRoutineDay(DAY);
    useRoutineStore.getState().addExerciseToDay(RDE);
    useRoutineStore.getState().deleteRoutine("r1");
    const state = useRoutineStore.getState();
    expect(state.routineDays["r1"]).toBeUndefined();
    expect(state.routineDayExercises["d1"]).toBeUndefined();
  });

  it("clears activeRoutineId when the active routine is deleted", () => {
    useRoutineStore.getState().createRoutine(ROUTINE);
    useRoutineStore.getState().setActiveRoutine("r1");
    useRoutineStore.getState().deleteRoutine("r1");
    expect(useRoutineStore.getState().activeRoutineId).toBeNull();
  });
});

// ─── copyRoutine ──────────────────────────────────────────────────────────────

describe("copyRoutine", () => {
  it("creates a copy with prefixed name and new ID", () => {
    useRoutineStore.getState().createRoutine(ROUTINE);
    useRoutineStore.getState().copyRoutine(ROUTINE, "r1-copy");
    const routines = useRoutineStore.getState().routines;
    expect(routines).toHaveLength(2);
    const copy = routines.find((r) => r.id === "r1-copy")!;
    expect(copy.name).toBe("Copy of Push Day");
  });
});

// ─── loadRoutineDays ──────────────────────────────────────────────────────────

describe("loadRoutineDays [T2.2]", () => {
  it("stores days under the correct routineId key", () => {
    useRoutineStore.getState().loadRoutineDays("r1", [DAY, DAY2]);
    expect(useRoutineStore.getState().routineDays["r1"]).toHaveLength(2);
  });

  it("initialises empty exercise arrays for each day", () => {
    useRoutineStore.getState().loadRoutineDays("r1", [DAY]);
    expect(useRoutineStore.getState().routineDayExercises["d1"]).toEqual([]);
  });
});

// ─── addRoutineDay ────────────────────────────────────────────────────────────

describe("addRoutineDay", () => {
  it("appends day and initialises exercise slot", () => {
    useRoutineStore.getState().createRoutine(ROUTINE);
    useRoutineStore.getState().addRoutineDay(DAY);
    expect(useRoutineStore.getState().routineDays["r1"]).toHaveLength(1);
    expect(useRoutineStore.getState().routineDayExercises["d1"]).toEqual([]);
  });
});

// ─── deleteRoutineDay ─────────────────────────────────────────────────────────

describe("deleteRoutineDay", () => {
  it("removes day and its exercises", () => {
    useRoutineStore.getState().createRoutine(ROUTINE);
    useRoutineStore.getState().addRoutineDay(DAY);
    useRoutineStore.getState().addExerciseToDay(RDE);
    useRoutineStore.getState().deleteRoutineDay("r1", "d1");
    expect(useRoutineStore.getState().routineDays["r1"]).toHaveLength(0);
    expect(useRoutineStore.getState().routineDayExercises["d1"]).toBeUndefined();
  });
});

// ─── reorderDays ─────────────────────────────────────────────────────────────

describe("reorderDays", () => {
  it("reorders days by order_index", () => {
    useRoutineStore.getState().loadRoutineDays("r1", [DAY, DAY2]);
    useRoutineStore.getState().reorderDays("r1", [
      { id: "d2", order_index: 0 },
      { id: "d1", order_index: 1 },
    ]);
    const days = useRoutineStore.getState().routineDays["r1"]!;
    expect(days[0]!.id).toBe("d2");
    expect(days[1]!.id).toBe("d1");
  });
});

// ─── addExerciseToDay / removeExerciseFromDay ─────────────────────────────────

describe("addExerciseToDay / removeExerciseFromDay", () => {
  it("adds exercise to the correct day", () => {
    useRoutineStore.getState().loadRoutineDays("r1", [DAY]);
    useRoutineStore.getState().addExerciseToDay(RDE);
    expect(useRoutineStore.getState().routineDayExercises["d1"]).toHaveLength(1);
  });

  it("removes exercise by id", () => {
    useRoutineStore.getState().loadRoutineDays("r1", [DAY]);
    useRoutineStore.getState().addExerciseToDay(RDE);
    useRoutineStore.getState().removeExerciseFromDay("d1", "rde1");
    expect(useRoutineStore.getState().routineDayExercises["d1"]).toHaveLength(0);
  });
});

// ─── savePredefinedSets / loadPredefinedSets ──────────────────────────────────

describe("savePredefinedSets / loadPredefinedSets", () => {
  const PSETS: PredefinedSet[] = [
    { id: "ps1", routine_day_exercise_id: "rde1", weight: 80, reps: 5, order_index: 0 },
  ];

  it("saves predefined sets under the rdExerciseId key", () => {
    useRoutineStore.getState().savePredefinedSets("rde1", PSETS);
    expect(useRoutineStore.getState().predefinedSets["rde1"]).toHaveLength(1);
  });

  it("loadPredefinedSets replaces existing sets", () => {
    useRoutineStore.getState().savePredefinedSets("rde1", PSETS);
    useRoutineStore.getState().loadPredefinedSets("rde1", []);
    expect(useRoutineStore.getState().predefinedSets["rde1"]).toHaveLength(0);
  });
});

// ─── setLoading / setError ────────────────────────────────────────────────────

describe("setLoading / setError", () => {
  it("setLoading changes isLoading", () => {
    useRoutineStore.getState().setLoading(true);
    expect(useRoutineStore.getState().isLoading).toBe(true);
  });

  it("setError sets error string", () => {
    useRoutineStore.getState().setError("oops");
    expect(useRoutineStore.getState().error).toBe("oops");
  });
});
