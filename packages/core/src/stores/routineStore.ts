import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Routine, RoutineDay, RoutineDayExercise } from "../types/index.js";

interface RoutineState {
  routines: Routine[];
  routineDays: Record<string, RoutineDay[]>;
  routineDayExercises: Record<string, RoutineDayExercise[]>;
  activeRoutineId: string | null;
}

interface RoutineActions {
  loadRoutines: (routines: Routine[]) => void;
  createRoutine: (routine: Routine) => void;
  updateRoutine: (id: string, patch: Partial<Routine>) => void;
  deleteRoutine: (id: string) => void;
  setActiveRoutine: (id: string | null) => void;
  addRoutineDay: (day: RoutineDay) => void;
  updateRoutineDay: (id: string, patch: Partial<RoutineDay>) => void;
  deleteRoutineDay: (routineId: string, dayId: string) => void;
  addExerciseToDay: (exercise: RoutineDayExercise) => void;
  removeExerciseFromDay: (dayId: string, exerciseId: string) => void;
  // Logs a workout from a routine day template — actual persistence handled by workoutStore
  logRoutineWorkout: (routineId: string, dayId: string, date: string) => void;
}

type RoutineStore = RoutineState & RoutineActions;

export const useRoutineStore = create<RoutineStore>()(
  immer((set) => ({
    routines: [],
    routineDays: {},
    routineDayExercises: {},
    activeRoutineId: null,

    loadRoutines: (routines) =>
      set((state) => {
        state.routines = routines;
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
          delete state.routineDayExercises[day.id];
        }
        delete state.routineDays[id];
        if (state.activeRoutineId === id) state.activeRoutineId = null;
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
        delete state.routineDayExercises[dayId];
      }),

    addExerciseToDay: (exercise) =>
      set((state) => {
        if (!state.routineDayExercises[exercise.routine_day_id]) {
          state.routineDayExercises[exercise.routine_day_id] = [];
        }
        state.routineDayExercises[exercise.routine_day_id]!.push(exercise);
      }),

    removeExerciseFromDay: (dayId, exerciseId) =>
      set((state) => {
        const exercises = state.routineDayExercises[dayId];
        if (exercises) {
          state.routineDayExercises[dayId] = exercises.filter(
            (e) => e.exercise_id !== exerciseId
          );
        }
      }),

    // TODO: wire up to workoutStore.startWorkout and add exercises from the day template
    logRoutineWorkout: (_routineId, _dayId, _date) => {
      // Dispatch to workoutStore after fetching routine day exercises
    },
  }))
);
