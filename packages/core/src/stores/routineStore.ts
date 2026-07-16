/**
 * Store Zustand de rutinas: rutinas → días → ejercicios de cada día → sets
 * predefinidos de cada ejercicio, cada nivel indexado por el id de su padre.
 * No llama a Supabase directamente: cuando el usuario quiere "loguear" un
 * día de rutina como entrenamiento, expone la intención vía
 * `pendingRoutineLog`/`logRoutineWorkout` para que la capa de UI (que sí
 * tiene acceso al repositorio) la resuelva.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Routine, RoutineDay, RoutineDayExercise, PredefinedSet } from "../types/index.js";

interface RoutineState {
  routines: Routine[];
  /** Días de cada rutina, indexados por `routine_id`. */
  routineDays: Record<string, RoutineDay[]>;
  /** Ejercicios de cada día, indexados por `routine_day_id`. */
  routineDayExercises: Record<string, RoutineDayExercise[]>;
  /** Sets predefinidos de cada ejercicio de rutina, indexados por el id del `RoutineDayExercise`. */
  predefinedSets: Record<string, PredefinedSet[]>;
  activeRoutineId: string | null;
  /** Set by logRoutineWorkout — the UI layer observes this and handles Supabase calls. */
  pendingRoutineLog: { routineId: string; dayId: string; date: string } | null;
  isLoading: boolean;
  error: string | null;
}

interface RoutineActions {
  /** Reemplaza la lista completa de rutinas. */
  loadRoutines: (routines: Routine[]) => void;
  /** Carga los días de una rutina y garantiza una entrada (posiblemente vacía) en `routineDayExercises` para cada día. */
  loadRoutineDays: (routineId: string, days: RoutineDay[]) => void;
  /** Reemplaza los ejercicios cacheados de un día de rutina. */
  loadRoutineDayExercises: (dayId: string, exercises: RoutineDayExercise[]) => void;
  /** Reemplaza los sets predefinidos cacheados de un ejercicio de rutina. */
  loadPredefinedSets: (rdExerciseId: string, sets: PredefinedSet[]) => void;
  /** Añade una rutina nueva y le inicializa una lista vacía de días. */
  createRoutine: (routine: Routine) => void;
  /** Mergea un patch parcial sobre la rutina con ese id. */
  updateRoutine: (id: string, patch: Partial<Routine>) => void;
  /** Elimina la rutina y, en cascada dentro del store, sus días, ejercicios de día y sets predefinidos asociados; limpia `activeRoutineId` si apuntaba a ella. */
  deleteRoutine: (id: string) => void;
  /** Duplica `original` bajo `newId` con el nombre prefijado "Copy of ..." y una lista de días vacía (no copia los días). */
  copyRoutine: (original: Routine, newId: string) => void;
  setActiveRoutine: (id: string | null) => void;
  /** Añade un día a `routineDays[day.routine_id]` (crea la lista si no existía) y le inicializa una lista vacía de ejercicios. */
  addRoutineDay: (day: RoutineDay) => void;
  /** Mergea un patch parcial sobre el día con ese id, buscándolo en todas las rutinas cacheadas. */
  updateRoutineDay: (id: string, patch: Partial<RoutineDay>) => void;
  /** Elimina el día y, en cascada dentro del store, los sets predefinidos de sus ejercicios. */
  deleteRoutineDay: (routineId: string, dayId: string) => void;
  /** Reescribe `order_index` de los días indicados y reordena la lista según el nuevo índice. */
  reorderDays: (routineId: string, updates: { id: string; order_index: number }[]) => void;
  /** Añade un ejercicio al día correspondiente (crea la lista si no existía). */
  addExerciseToDay: (exercise: RoutineDayExercise) => void;
  /** Quita el ejercicio del día y borra sus sets predefinidos cacheados. */
  removeExerciseFromDay: (dayId: string, rdExerciseId: string) => void;
  /** Reescribe `order_index` de los ejercicios indicados y reordena la lista según el nuevo índice. */
  reorderExercisesInDay: (dayId: string, updates: { id: string; order_index: number }[]) => void;
  /** Reemplaza los sets predefinidos de un ejercicio de rutina (misma acción que `loadPredefinedSets`, usada tras editar en vez de cargar). */
  savePredefinedSets: (rdExerciseId: string, sets: PredefinedSet[]) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  /**
   * Signal that the UI should create a workout from this routine day.
   * Sets pendingRoutineLog — the UI layer observes it and calls workoutRepository.
   * Call clearPendingRoutineLog() after handling.
   */
  logRoutineWorkout: (routineId: string, dayId: string, date: string) => void;
  clearPendingRoutineLog: () => void;
  /** Returns the exercises + predefined sets for a routine day, for the UI to use when creating the workout. */
  getRoutineWorkoutPayload: (
    routineId: string,
    dayId: string
  ) => { exercises: RoutineDayExercise[]; setsByExercise: Record<string, PredefinedSet[]> };
}

type RoutineStore = RoutineState & RoutineActions;

/** Store combinado (estado + acciones) de rutinas, con Immer para mutaciones ergonómicas. */
export const useRoutineStore = create<RoutineStore>()(
  immer((set, get) => ({
    routines: [],
    routineDays: {},
    routineDayExercises: {},
    predefinedSets: {},
    activeRoutineId: null,
    pendingRoutineLog: null,
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

    logRoutineWorkout: (routineId, dayId, date) =>
      set((state) => {
        state.pendingRoutineLog = { routineId, dayId, date };
      }),

    clearPendingRoutineLog: () =>
      set((state) => {
        state.pendingRoutineLog = null;
      }),

    getRoutineWorkoutPayload: (routineId, dayId) => {
      const state = get();
      const exercises = state.routineDayExercises[dayId] ?? [];
      const setsByExercise: Record<string, PredefinedSet[]> = {};
      for (const ex of exercises) {
        setsByExercise[ex.id] = state.predefinedSets[ex.id] ?? [];
      }
      return { exercises, setsByExercise };
    },
  }))
);
