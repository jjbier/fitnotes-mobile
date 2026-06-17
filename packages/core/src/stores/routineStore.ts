import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Routine, RoutineDay, RoutineDayExercise, PredefinedSet } from "../types/index.js";

interface RoutineState {
  routines: Routine[];
  routineDays: Record<string, RoutineDay[]>;
  routineDayExercises: Record<string, RoutineDayExercise[]>;
  predefinedSets: Record<string, PredefinedSet[]>;
  activeRoutineId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface RoutineActions {
  loadRoutines: (routines: Routine[]) => void;
  loadRoutineDays: (routineId: string, days: RoutineDay[]) => void;
  loadRoutineDayExercises: (dayId: string, exercises: RoutineDayExercise[]) => void;
  loadPredefinedSets: (rdExerciseId: string, sets: PredefinedSet[]) => void;
  createRoutine: (routine: Routine) => void;
  updateRoutine: (id: string, patch: Partial<Routine>) => void;
  deleteRoutine: (id: string) => void;
  copyRoutine: (original: Routine, newId: string) => void;
  setActiveRoutine: (id: string | null) => void;
  addRoutineDay: (day: RoutineDay) => void;
  updateRoutineDay: (id: string, patch: Partial<RoutineDay>) => void;
  deleteRoutineDay: (routineId: string, dayId: string) => void;
  reorderDays: (routineId: string, updates: { id: string; order_index: number }[]) => void;
  addExerciseToDay: (exercise: RoutineDayExercise) => void;
  removeExerciseFromDay: (dayId: string, rdExerciseId: string) => void;
  reorderExercisesInDay: (dayId: string, updates: { id: string; order_index: number }[]) => void;
  savePredefinedSets: (rdExerciseId: string, sets: PredefinedSet[]) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  logRoutineWorkout: (routineId: string, dayId: string, date: string) => void;
}

type RoutineStore = RoutineState & RoutineActions;

export const useRoutineStore = create<RoutineStore>()(
  immer((set) => ({
    routines: [],
    routineDays: {},
    routineDayExercises: {},
    predefinedSets: {},
    activeRoutineId: null,
    isLoading: false,
    error: null,

    loadRoutines: (routines) =>
      set((state) => {
        state.routines = routines;
      }),

    loadRoutineDays: (routineId, days) =>
      set((state) => {
        state.routineDays[routineId] = days;
        for (const d of days) {
          if (!state.routineDayExercises[d.id]) {
            state.routineDayExercises[d.id] = [];
          }
        }
      }),

    loadRoutineDayExercises: (dayId, exercises) =>
      set((state) => {
        state.routineDayExercises[dayId] = exercises;
      }),

    loadPredefinedSets: (rdExerciseId, sets) =>
      set((state) => {
        state.predefinedSets[rdExerciseId] = sets;
      }),

    createRoutine: (routine) =>
      set((state) => {
        state.routines.push(routine);
        state.routineDays[routine.id] = [];
      }),

    updateRoutine: (id, patch) =>
      set((state) => {
        const idx = state.routines.findIndex((r) => r.id === id);
        if (idx !== -1) Object.assign(state.routines[idx]!, patch);
      }),

    deleteRoutine: (id) =>
      set((state) => {
        state.routines = state.routines.filter((r) => r.id !== id);
        const days = state.routineDays[id] ?? [];
        for (const day of days) {
          for (const ex of state.routineDayExercises[day.id] ?? []) {
            delete state.predefinedSets[ex.id];
          }
          delete state.routineDayExercises[day.id];
        }
        delete state.routineDays[id];
        if (state.activeRoutineId === id) state.activeRoutineId = null;
      }),

    copyRoutine: (original, newId) =>
      set((state) => {
        const copy: Routine = { ...original, id: newId, name: `Copy of ${original.name}` };
        state.routines.push(copy);
        state.routineDays[newId] = [];
      }),

    setActiveRoutine: (id) =>
      set((state) => {
        state.activeRoutineId = id;
      }),

    addRoutineDay: (day) =>
      set((state) => {
        if (!state.routineDays[day.routine_id]) {
          state.routineDays[day.routine_id] = [];
        }
        state.routineDays[day.routine_id]!.push(day);
        state.routineDayExercises[day.id] = [];
      }),

    updateRoutineDay: (id, patch) =>
      set((state) => {
        for (const days of Object.values(state.routineDays)) {
          const idx = days.findIndex((d) => d.id === id);
          if (idx !== -1) {
            Object.assign(days[idx]!, patch);
            break;
          }
        }
      }),

    deleteRoutineDay: (routineId, dayId) =>
      set((state) => {
        const days = state.routineDays[routineId];
        if (days) {
          state.routineDays[routineId] = days.filter((d) => d.id !== dayId);
        }
        for (const ex of state.routineDayExercises[dayId] ?? []) {
          delete state.predefinedSets[ex.id];
        }
        delete state.routineDayExercises[dayId];
      }),

    reorderDays: (routineId, updates) =>
      set((state) => {
        const days = state.routineDays[routineId];
        if (!days) return;
        for (const { id, order_index } of updates) {
          const day = days.find((d) => d.id === id);
          if (day) day.order_index = order_index;
        }
        days.sort((a, b) => a.order_index - b.order_index);
      }),

    addExerciseToDay: (exercise) =>
      set((state) => {
        if (!state.routineDayExercises[exercise.routine_day_id]) {
          state.routineDayExercises[exercise.routine_day_id] = [];
        }
        state.routineDayExercises[exercise.routine_day_id]!.push(exercise);
      }),

    removeExerciseFromDay: (dayId, rdExerciseId) =>
      set((state) => {
        const exercises = state.routineDayExercises[dayId];
        if (exercises) {
          state.routineDayExercises[dayId] = exercises.filter((e) => e.id !== rdExerciseId);
        }
        delete state.predefinedSets[rdExerciseId];
      }),

    reorderExercisesInDay: (dayId, updates) =>
      set((state) => {
        const exercises = state.routineDayExercises[dayId];
        if (!exercises) return;
        for (const { id, order_index } of updates) {
          const ex = exercises.find((e) => e.id === id);
          if (ex) ex.order_index = order_index;
        }
        exercises.sort((a, b) => a.order_index - b.order_index);
      }),

    savePredefinedSets: (rdExerciseId, sets) =>
      set((state) => {
        state.predefinedSets[rdExerciseId] = sets;
      }),

    setLoading: (v) =>
      set((state) => {
        state.isLoading = v;
      }),

    setError: (v) =>
      set((state) => {
        state.error = v;
      }),

    logRoutineWorkout: (_routineId, _dayId, _date) => {
      // Wired in Phase 3 when workoutStore is complete
    },
  }))
);
