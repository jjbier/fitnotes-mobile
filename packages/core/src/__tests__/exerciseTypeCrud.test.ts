import { describe, it, expect, beforeEach } from "vitest";
import { useWorkoutStore } from "../stores/workoutStore.js";
import type { Workout, WorkoutExercise } from "../types/index.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKOUT: Workout = { id: "w1", date: "2024-06-01" };

function makeWE(id: string, exerciseId: string): WorkoutExercise {
  return { id, workout_id: "w1", exercise_id: exerciseId, order_index: 0 };
}

beforeEach(() => {
  useWorkoutStore.getState().resetWorkout();
});

// ─── WEIGHT_REPS ──────────────────────────────────────────────────────────────
// Uso típico: press de banca, sentadilla — se registra peso (kg/lb) y repeticiones

describe("WEIGHT_REPS — CRUD de sets", () => {
  const WE = makeWE("we-wr", "ex-wr");

  beforeEach(() => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], { "we-wr": [] });
  });

  it("C — crea un set con weight y reps", () => {
    useWorkoutStore.getState().createSet("we-wr", { weight: 100, reps: 5 });
    const sets = useWorkoutStore.getState().sets["we-wr"]!;
    expect(sets).toHaveLength(1);
    expect(sets[0]!.weight).toBe(100);
    expect(sets[0]!.reps).toBe(5);
    expect(sets[0]!.distance).toBeUndefined();
    expect(sets[0]!.time_seconds).toBeUndefined();
    expect(sets[0]!.is_complete).toBe(false);
  });

  it("R — lee el set correctamente desde el store", () => {
    useWorkoutStore.getState().createSet("we-wr", { weight: 80, reps: 8 });
    const s = useWorkoutStore.getState().sets["we-wr"]![0]!;
    expect(s.weight).toBe(80);
    expect(s.reps).toBe(8);
  });

  it("U — actualiza weight y reps", () => {
    useWorkoutStore.getState().createSet("we-wr", { weight: 100, reps: 5 });
    const id = useWorkoutStore.getState().sets["we-wr"]![0]!.id;
    useWorkoutStore.getState().updateSet("we-wr", id, { weight: 110, reps: 3 });
    const s = useWorkoutStore.getState().sets["we-wr"]![0]!;
    expect(s.weight).toBe(110);
    expect(s.reps).toBe(3);
  });

  it("D — elimina el set", () => {
    useWorkoutStore.getState().createSet("we-wr", { weight: 100, reps: 5 });
    const id = useWorkoutStore.getState().sets["we-wr"]![0]!.id;
    useWorkoutStore.getState().deleteSet("we-wr", id);
    expect(useWorkoutStore.getState().sets["we-wr"]).toHaveLength(0);
  });

  it("U — marcar como completado", () => {
    useWorkoutStore.getState().createSet("we-wr", { weight: 100, reps: 5 });
    const id = useWorkoutStore.getState().sets["we-wr"]![0]!.id;
    useWorkoutStore.getState().markSetComplete("we-wr", id, true);
    expect(useWorkoutStore.getState().sets["we-wr"]![0]!.is_complete).toBe(true);
  });

  it("C — múltiples sets conservan el order_index correcto", () => {
    useWorkoutStore.getState().createSet("we-wr", { weight: 60, reps: 10 });
    useWorkoutStore.getState().createSet("we-wr", { weight: 80, reps: 8 });
    useWorkoutStore.getState().createSet("we-wr", { weight: 100, reps: 5 });
    const sets = useWorkoutStore.getState().sets["we-wr"]!;
    expect(sets).toHaveLength(3);
    expect(sets[0]!.order_index).toBe(0);
    expect(sets[1]!.order_index).toBe(1);
    expect(sets[2]!.order_index).toBe(2);
  });
});

// ─── DISTANCE_TIME ────────────────────────────────────────────────────────────
// Uso típico: carrera, ciclismo — se registra distancia (m) y tiempo (segundos)

describe("DISTANCE_TIME — CRUD de sets", () => {
  const WE = makeWE("we-dt", "ex-dt");

  beforeEach(() => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], { "we-dt": [] });
  });

  it("C — crea un set con distance y time_seconds", () => {
    useWorkoutStore.getState().createSet("we-dt", { distance: 5000, time_seconds: 1800 });
    const sets = useWorkoutStore.getState().sets["we-dt"]!;
    expect(sets).toHaveLength(1);
    expect(sets[0]!.distance).toBe(5000);
    expect(sets[0]!.time_seconds).toBe(1800);
    expect(sets[0]!.weight).toBeUndefined();
    expect(sets[0]!.reps).toBeUndefined();
    expect(sets[0]!.is_complete).toBe(false);
  });

  it("R — lee distance y time_seconds desde el store", () => {
    useWorkoutStore.getState().createSet("we-dt", { distance: 10000, time_seconds: 3600 });
    const s = useWorkoutStore.getState().sets["we-dt"]![0]!;
    expect(s.distance).toBe(10000);
    expect(s.time_seconds).toBe(3600);
  });

  it("U — actualiza distance y time_seconds", () => {
    useWorkoutStore.getState().createSet("we-dt", { distance: 5000, time_seconds: 1800 });
    const id = useWorkoutStore.getState().sets["we-dt"]![0]!.id;
    useWorkoutStore.getState().updateSet("we-dt", id, { distance: 6000, time_seconds: 2100 });
    const s = useWorkoutStore.getState().sets["we-dt"]![0]!;
    expect(s.distance).toBe(6000);
    expect(s.time_seconds).toBe(2100);
  });

  it("D — elimina el set", () => {
    useWorkoutStore.getState().createSet("we-dt", { distance: 5000, time_seconds: 1800 });
    const id = useWorkoutStore.getState().sets["we-dt"]![0]!.id;
    useWorkoutStore.getState().deleteSet("we-dt", id);
    expect(useWorkoutStore.getState().sets["we-dt"]).toHaveLength(0);
  });

  it("U — marcar como completado", () => {
    useWorkoutStore.getState().createSet("we-dt", { distance: 5000, time_seconds: 1800 });
    const id = useWorkoutStore.getState().sets["we-dt"]![0]!.id;
    useWorkoutStore.getState().markSetComplete("we-dt", id, true);
    expect(useWorkoutStore.getState().sets["we-dt"]![0]!.is_complete).toBe(true);
  });

  it("C — intervalos: múltiples sets de carrera independientes", () => {
    useWorkoutStore.getState().createSet("we-dt", { distance: 400, time_seconds: 90 });
    useWorkoutStore.getState().createSet("we-dt", { distance: 400, time_seconds: 92 });
    useWorkoutStore.getState().createSet("we-dt", { distance: 400, time_seconds: 88 });
    const sets = useWorkoutStore.getState().sets["we-dt"]!;
    expect(sets).toHaveLength(3);
    expect(sets[1]!.time_seconds).toBe(92);
  });
});

// ─── REPS_ONLY ────────────────────────────────────────────────────────────────
// Uso típico: dominadas, flexiones — solo se registra el número de repeticiones

describe("REPS_ONLY — CRUD de sets", () => {
  const WE = makeWE("we-ro", "ex-ro");

  beforeEach(() => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], { "we-ro": [] });
  });

  it("C — crea un set con reps (sin weight)", () => {
    useWorkoutStore.getState().createSet("we-ro", { reps: 12 });
    const sets = useWorkoutStore.getState().sets["we-ro"]!;
    expect(sets).toHaveLength(1);
    expect(sets[0]!.reps).toBe(12);
    expect(sets[0]!.weight).toBeUndefined();
    expect(sets[0]!.distance).toBeUndefined();
    expect(sets[0]!.time_seconds).toBeUndefined();
  });

  it("R — lee reps desde el store", () => {
    useWorkoutStore.getState().createSet("we-ro", { reps: 15 });
    expect(useWorkoutStore.getState().sets["we-ro"]![0]!.reps).toBe(15);
  });

  it("U — actualiza reps", () => {
    useWorkoutStore.getState().createSet("we-ro", { reps: 10 });
    const id = useWorkoutStore.getState().sets["we-ro"]![0]!.id;
    useWorkoutStore.getState().updateSet("we-ro", id, { reps: 15 });
    expect(useWorkoutStore.getState().sets["we-ro"]![0]!.reps).toBe(15);
  });

  it("D — elimina el set", () => {
    useWorkoutStore.getState().createSet("we-ro", { reps: 10 });
    const id = useWorkoutStore.getState().sets["we-ro"]![0]!.id;
    useWorkoutStore.getState().deleteSet("we-ro", id);
    expect(useWorkoutStore.getState().sets["we-ro"]).toHaveLength(0);
  });

  it("U — marcar como completado", () => {
    useWorkoutStore.getState().createSet("we-ro", { reps: 10 });
    const id = useWorkoutStore.getState().sets["we-ro"]![0]!.id;
    useWorkoutStore.getState().markSetComplete("we-ro", id, true);
    expect(useWorkoutStore.getState().sets["we-ro"]![0]!.is_complete).toBe(true);
  });

  it("C — progresión de sets con reps decrecientes", () => {
    useWorkoutStore.getState().createSet("we-ro", { reps: 15 });
    useWorkoutStore.getState().createSet("we-ro", { reps: 12 });
    useWorkoutStore.getState().createSet("we-ro", { reps: 10 });
    const sets = useWorkoutStore.getState().sets["we-ro"]!;
    expect(sets).toHaveLength(3);
    expect(sets[0]!.reps).toBe(15);
    expect(sets[2]!.reps).toBe(10);
  });
});

// ─── WEIGHT_ONLY ──────────────────────────────────────────────────────────────
// Uso típico: máximo en 1 repetición (1RM) — solo se registra el peso levantado

describe("WEIGHT_ONLY — CRUD de sets", () => {
  const WE = makeWE("we-wo", "ex-wo");

  beforeEach(() => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], { "we-wo": [] });
  });

  it("C — crea un set con weight (sin reps)", () => {
    useWorkoutStore.getState().createSet("we-wo", { weight: 200 });
    const sets = useWorkoutStore.getState().sets["we-wo"]!;
    expect(sets).toHaveLength(1);
    expect(sets[0]!.weight).toBe(200);
    expect(sets[0]!.reps).toBeUndefined();
    expect(sets[0]!.distance).toBeUndefined();
    expect(sets[0]!.time_seconds).toBeUndefined();
  });

  it("R — lee weight desde el store", () => {
    useWorkoutStore.getState().createSet("we-wo", { weight: 150 });
    expect(useWorkoutStore.getState().sets["we-wo"]![0]!.weight).toBe(150);
  });

  it("U — actualiza weight", () => {
    useWorkoutStore.getState().createSet("we-wo", { weight: 180 });
    const id = useWorkoutStore.getState().sets["we-wo"]![0]!.id;
    useWorkoutStore.getState().updateSet("we-wo", id, { weight: 195 });
    expect(useWorkoutStore.getState().sets["we-wo"]![0]!.weight).toBe(195);
  });

  it("D — elimina el set", () => {
    useWorkoutStore.getState().createSet("we-wo", { weight: 200 });
    const id = useWorkoutStore.getState().sets["we-wo"]![0]!.id;
    useWorkoutStore.getState().deleteSet("we-wo", id);
    expect(useWorkoutStore.getState().sets["we-wo"]).toHaveLength(0);
  });

  it("U — marcar como completado", () => {
    useWorkoutStore.getState().createSet("we-wo", { weight: 200 });
    const id = useWorkoutStore.getState().sets["we-wo"]![0]!.id;
    useWorkoutStore.getState().markSetComplete("we-wo", id, true);
    expect(useWorkoutStore.getState().sets["we-wo"]![0]!.is_complete).toBe(true);
  });

  it("C — intento fallido no persiste", () => {
    useWorkoutStore.getState().createSet("we-wo", { weight: 200 });
    useWorkoutStore.getState().createSet("we-wo", { weight: 210 });
    const id = useWorkoutStore.getState().sets["we-wo"]![1]!.id;
    useWorkoutStore.getState().deleteSet("we-wo", id);
    const sets = useWorkoutStore.getState().sets["we-wo"]!;
    expect(sets).toHaveLength(1);
    expect(sets[0]!.weight).toBe(200);
  });
});

// ─── TIME_ONLY ────────────────────────────────────────────────────────────────
// Uso típico: plancha, descanso activo — solo se registra la duración en segundos

describe("TIME_ONLY — CRUD de sets", () => {
  const WE = makeWE("we-to", "ex-to");

  beforeEach(() => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE], { "we-to": [] });
  });

  it("C — crea un set con time_seconds (sin weight ni reps)", () => {
    useWorkoutStore.getState().createSet("we-to", { time_seconds: 60 });
    const sets = useWorkoutStore.getState().sets["we-to"]!;
    expect(sets).toHaveLength(1);
    expect(sets[0]!.time_seconds).toBe(60);
    expect(sets[0]!.weight).toBeUndefined();
    expect(sets[0]!.reps).toBeUndefined();
    expect(sets[0]!.distance).toBeUndefined();
  });

  it("R — lee time_seconds desde el store", () => {
    useWorkoutStore.getState().createSet("we-to", { time_seconds: 90 });
    expect(useWorkoutStore.getState().sets["we-to"]![0]!.time_seconds).toBe(90);
  });

  it("U — actualiza time_seconds", () => {
    useWorkoutStore.getState().createSet("we-to", { time_seconds: 45 });
    const id = useWorkoutStore.getState().sets["we-to"]![0]!.id;
    useWorkoutStore.getState().updateSet("we-to", id, { time_seconds: 75 });
    expect(useWorkoutStore.getState().sets["we-to"]![0]!.time_seconds).toBe(75);
  });

  it("D — elimina el set", () => {
    useWorkoutStore.getState().createSet("we-to", { time_seconds: 60 });
    const id = useWorkoutStore.getState().sets["we-to"]![0]!.id;
    useWorkoutStore.getState().deleteSet("we-to", id);
    expect(useWorkoutStore.getState().sets["we-to"]).toHaveLength(0);
  });

  it("U — marcar como completado", () => {
    useWorkoutStore.getState().createSet("we-to", { time_seconds: 60 });
    const id = useWorkoutStore.getState().sets["we-to"]![0]!.id;
    useWorkoutStore.getState().markSetComplete("we-to", id, true);
    expect(useWorkoutStore.getState().sets["we-to"]![0]!.is_complete).toBe(true);
  });

  it("C — progresión de series de plancha con tiempo creciente", () => {
    useWorkoutStore.getState().createSet("we-to", { time_seconds: 30 });
    useWorkoutStore.getState().createSet("we-to", { time_seconds: 45 });
    useWorkoutStore.getState().createSet("we-to", { time_seconds: 60 });
    const sets = useWorkoutStore.getState().sets["we-to"]!;
    expect(sets).toHaveLength(3);
    expect(sets[0]!.time_seconds).toBe(30);
    expect(sets[2]!.time_seconds).toBe(60);
  });
});

// ─── Aislamiento entre tipos ──────────────────────────────────────────────────
// Verifica que los sets de distintos tipos de ejercicio no interfieren entre sí

describe("aislamiento entre tipos de ejercicio en el mismo workout", () => {
  const WE_WR = makeWE("we-wr", "ex-wr");
  const WE_DT = makeWE("we-dt", "ex-dt");
  const WE_RO = makeWE("we-ro", "ex-ro");
  const WE_WO = makeWE("we-wo", "ex-wo");
  const WE_TO = makeWE("we-to", "ex-to");

  beforeEach(() => {
    useWorkoutStore.getState().loadWorkout(WORKOUT, [WE_WR, WE_DT, WE_RO, WE_WO, WE_TO], {
      "we-wr": [],
      "we-dt": [],
      "we-ro": [],
      "we-wo": [],
      "we-to": [],
    });
  });

  it("crear sets en los 5 tipos no contamina entre sí", () => {
    useWorkoutStore.getState().createSet("we-wr", { weight: 100, reps: 5 });
    useWorkoutStore.getState().createSet("we-dt", { distance: 5000, time_seconds: 1800 });
    useWorkoutStore.getState().createSet("we-ro", { reps: 12 });
    useWorkoutStore.getState().createSet("we-wo", { weight: 200 });
    useWorkoutStore.getState().createSet("we-to", { time_seconds: 60 });

    const state = useWorkoutStore.getState();
    expect(state.sets["we-wr"]).toHaveLength(1);
    expect(state.sets["we-dt"]).toHaveLength(1);
    expect(state.sets["we-ro"]).toHaveLength(1);
    expect(state.sets["we-wo"]).toHaveLength(1);
    expect(state.sets["we-to"]).toHaveLength(1);
  });

  it("eliminar un set de un tipo no afecta los demás", () => {
    useWorkoutStore.getState().createSet("we-wr", { weight: 100, reps: 5 });
    useWorkoutStore.getState().createSet("we-ro", { reps: 10 });
    const idWr = useWorkoutStore.getState().sets["we-wr"]![0]!.id;

    useWorkoutStore.getState().deleteSet("we-wr", idWr);

    expect(useWorkoutStore.getState().sets["we-wr"]).toHaveLength(0);
    expect(useWorkoutStore.getState().sets["we-ro"]).toHaveLength(1);
  });

  it("actualizar WEIGHT_REPS no modifica los sets de DISTANCE_TIME", () => {
    useWorkoutStore.getState().createSet("we-wr", { weight: 80, reps: 8 });
    useWorkoutStore.getState().createSet("we-dt", { distance: 5000, time_seconds: 1800 });
    const idWr = useWorkoutStore.getState().sets["we-wr"]![0]!.id;

    useWorkoutStore.getState().updateSet("we-wr", idWr, { weight: 90, reps: 6 });

    const dtSet = useWorkoutStore.getState().sets["we-dt"]![0]!;
    expect(dtSet.distance).toBe(5000);
    expect(dtSet.time_seconds).toBe(1800);
  });
});
