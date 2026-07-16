/**
 * Store Zustand del entrenamiento activo y del historial de entrenamientos.
 * `sets` está indexado por `workout_exercise_id` (no por `exercise_id`) para
 * soportar el mismo ejercicio repetido varias veces en un entrenamiento
 * (cada aparición es un `WorkoutExercise` distinto). Los ids nuevos se
 * generan aquí mismo con `generateUUID()` — nunca ids temporales — para que
 * un registro creado offline conserve el mismo id tras sincronizar.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Workout, WorkoutExercise, Set } from "../types/index.js";
import { generateUUID } from "../utils/uuid.js";

interface WorkoutState {
  currentDate: string;
  activeWorkout: Workout | null;
  exercises: WorkoutExercise[];
  /** Sets de cada ejercicio del entrenamiento activo, indexados por `workout_exercise_id`. */
  sets: Record<string, Set[]>;
  activeExerciseId: string | null;
  workouts: Workout[];
  isLoading: boolean;
  error: string | null;
}

interface WorkoutActions {
  /** Crea un `activeWorkout` nuevo (con id y `start_time` generados aquí) para `date` y resetea ejercicios/sets. */
  startWorkout: (date: string) => void;
  /** Reemplaza `activeWorkout`/`exercises`/`sets` con un entrenamiento ya existente (p. ej. al abrir uno del historial). */
  loadWorkout: (workout: Workout, exercises: WorkoutExercise[], sets: Record<string, Set[]>) => void;
  loadWorkouts: (workouts: Workout[]) => void;
  /** Añade un entrenamiento al principio del historial si no existe ya uno con el mismo id (evita duplicados). */
  addWorkoutToHistory: (workout: Workout) => void;
  /**
   * Añade un ejercicio al entrenamiento activo (no-op si no hay uno activo).
   * Si `weId` no se indica, genera un id nuevo; inicializa su lista de sets
   * vacía y lo marca como `activeExerciseId`.
   */
  addExerciseToWorkout: (exerciseId: string, weId?: string) => void;
  /** Quita el ejercicio del entrenamiento activo y borra sus sets cacheados. */
  removeExerciseFromWorkout: (workoutExerciseId: string) => void;
  /** Quita el entrenamiento del historial; si era el `activeWorkout`, también lo limpia (junto con `exercises`/`sets`). */
  removeWorkoutFromHistory: (workoutId: string) => void;
  /** Crea un set nuevo para el ejercicio (id generado, incompleto, no warmup, al final de la lista) mezclando los valores de `partial` encima de esos defaults. */
  createSet: (workoutExerciseId: string, partial?: Partial<Set>) => void;
  /** Mergea un patch parcial sobre el set indicado. */
  updateSet: (workoutExerciseId: string, setId: string, patch: Partial<Set>) => void;
  deleteSet: (workoutExerciseId: string, setId: string) => void;
  markSetComplete: (workoutExerciseId: string, setId: string, complete: boolean) => void;
  /** Reescribe `order_index` de los ejercicios del entrenamiento activo según el orden de `orderedIds`. */
  reorderExercises: (orderedIds: string[]) => void;
  setActiveExercise: (exerciseId: string | null) => void;
  /** Actualiza el comentario del `activeWorkout` (no-op si no hay uno activo). */
  setWorkoutComment: (comment: string) => void;
  /** Reescribe `order_index` de los sets de un ejercicio según el orden de `orderedIds`. */
  reorderSets: (weId: string, orderedIds: string[]) => void;
  /** Agrupa dos ejercicios del entrenamiento activo como superset, asignándoles un `group_id` nuevo compartido. */
  groupExercises: (weId1: string, weId2: string) => void;
  /** Quita el `group_id` del ejercicio (lo saca de su superset). */
  ungroupExercise: (weId: string) => void;
  /** Asigna directamente el `group_id` de un ejercicio (usar para añadir/mover un ejercicio a un grupo ya existente). */
  updateWorkoutExerciseGroup: (weId: string, groupId: string | undefined) => void;
  /** Renombra el grupo (superset) con ese `group_id` en todos los ejercicios que lo comparten; un nombre vacío limpia `group_name`. */
  renameGroup: (groupId: string, name: string) => void;
  /** Fija `start_time` del `activeWorkout` solo si aún no tenía uno (no sobrescribe un inicio ya registrado). */
  setWorkoutStartTime: (startTime: string) => void;
  /** Marca `end_time` como ahora y calcula `duration_minutes` a partir de `start_time` (redondeado a minutos enteros); no-op si no hay entrenamiento activo. */
  finishWorkout: () => void;
  /** Restaura el store completo a `initialState` (entrenamiento activo, historial y sets incluidos). */
  resetWorkout: () => void;
  setCurrentDate: (date: string) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

type WorkoutStore = WorkoutState & WorkoutActions;

const initialState: WorkoutState = {
  currentDate: new Date().toISOString().split("T")[0]!,
  activeWorkout: null,
  exercises: [],
  sets: {},
  activeExerciseId: null,
  workouts: [],
  isLoading: false,
  error: null,
};

/** Store combinado (estado + acciones) del entrenamiento, con Immer para mutaciones ergonómicas. */
export const useWorkoutStore = create<WorkoutStore>()(
  immer((set) => ({
    ...initialState,

    startWorkout: (date) =>
      set((state) => {
        state.activeWorkout = {
          id: generateUUID(),
          date,
          start_time: new Date().toISOString(),
        };
        state.currentDate = date;
        state.exercises = [];
        state.sets = {};
      }),

    loadWorkout: (workout, exercises, sets) =>
      set((state) => {
        state.activeWorkout = workout;
        state.exercises = exercises;
        state.sets = sets;
        state.currentDate = workout.date;
      }),

    loadWorkouts: (workouts) =>
      set((state) => {
        state.workouts = workouts;
      }),

    addWorkoutToHistory: (workout) =>
      set((state) => {
        const exists = state.workouts.some((w) => w.id === workout.id);
        if (!exists) state.workouts.unshift(workout);
      }),

    addExerciseToWorkout: (exerciseId, weId) =>
      set((state) => {
        if (!state.activeWorkout) return;
        const entry: WorkoutExercise = {
          id: weId ?? generateUUID(),
          workout_id: state.activeWorkout.id,
          exercise_id: exerciseId,
          order_index: state.exercises.length,
        };
        state.exercises.push(entry);
        state.sets[entry.id] = [];
        state.activeExerciseId = exerciseId;
      }),

    removeExerciseFromWorkout: (workoutExerciseId) =>
      set((state) => {
        state.exercises = state.exercises.filter((e) => e.id !== workoutExerciseId);
        delete state.sets[workoutExerciseId];
      }),

    removeWorkoutFromHistory: (workoutId) =>
      set((state) => {
        state.workouts = state.workouts.filter((w) => w.id !== workoutId);
        if (state.activeWorkout?.id === workoutId) {
          state.activeWorkout = null;
          state.exercises = [];
          state.sets = {};
        }
      }),

    createSet: (workoutExerciseId, partial = {}) =>
      set((state) => {
        const existingSets = state.sets[workoutExerciseId] ?? [];
        const newSet: Set = {
          id: generateUUID(),
          workout_exercise_id: workoutExerciseId,
          is_complete: false,
          is_warmup: false,
          order_index: existingSets.length,
          ...partial,
        };
        if (!state.sets[workoutExerciseId]) {
          state.sets[workoutExerciseId] = [];
        }
        state.sets[workoutExerciseId]!.push(newSet);
      }),

    updateSet: (workoutExerciseId, setId, patch) =>
      set((state) => {
        const sets = state.sets[workoutExerciseId];
        if (!sets) return;
        const idx = sets.findIndex((s) => s.id === setId);
        if (idx === -1) return;
        Object.assign(sets[idx]!, patch);
      }),

    deleteSet: (workoutExerciseId, setId) =>
      set((state) => {
        const sets = state.sets[workoutExerciseId];
        if (!sets) return;
        state.sets[workoutExerciseId] = sets.filter((s) => s.id !== setId);
      }),

    markSetComplete: (workoutExerciseId, setId, complete) =>
      set((state) => {
        const sets = state.sets[workoutExerciseId];
        if (!sets) return;
        const s = sets.find((s) => s.id === setId);
        if (s) s.is_complete = complete;
      }),

    reorderExercises: (orderedIds) =>
      set((state) => {
        state.exercises = orderedIds
          .map((id, idx) => {
            const ex = state.exercises.find((e) => e.id === id);
            return ex ? { ...ex, order_index: idx } : null;
          })
          .filter((e): e is WorkoutExercise => e !== null);
      }),

    setActiveExercise: (exerciseId) =>
      set((state) => {
        state.activeExerciseId = exerciseId;
      }),

    setWorkoutComment: (comment) =>
      set((state) => {
        if (state.activeWorkout) state.activeWorkout.comment = comment;
      }),

    reorderSets: (weId, orderedIds) =>
      set((state) => {
        const existing = state.sets[weId];
        if (!existing) return;
        state.sets[weId] = orderedIds
          .map((id, idx) => {
            const s = existing.find((s) => s.id === id);
            return s ? { ...s, order_index: idx } : null;
          })
          .filter((s): s is Set => s !== null);
      }),

    groupExercises: (weId1, weId2) =>
      set((state) => {
        const groupId = generateUUID();
        for (const ex of state.exercises) {
          if (ex.id === weId1 || ex.id === weId2) ex.group_id = groupId;
        }
      }),

    ungroupExercise: (weId) =>
      set((state) => {
        const ex = state.exercises.find((e) => e.id === weId);
        if (ex) ex.group_id = undefined;
      }),

    updateWorkoutExerciseGroup: (weId, groupId) =>
      set((state) => {
        const ex = state.exercises.find((e) => e.id === weId);
        if (ex) ex.group_id = groupId;
      }),

    renameGroup: (groupId, name) =>
      set((state) => {
        for (const ex of state.exercises) {
          if (ex.group_id === groupId) ex.group_name = name || undefined;
        }
      }),

    setWorkoutStartTime: (startTime) =>
      set((state) => {
        if (state.activeWorkout && !state.activeWorkout.start_time) {
          state.activeWorkout.start_time = startTime;
        }
      }),

    finishWorkout: () =>
      set((state) => {
        if (!state.activeWorkout) return;
        const now = new Date().toISOString();
        state.activeWorkout.end_time = now;
        if (state.activeWorkout.start_time) {
          const diff =
            (new Date(now).getTime() -
              new Date(state.activeWorkout.start_time).getTime()) /
            60000;
          state.activeWorkout.duration_minutes = Math.round(diff);
        }
      }),

    resetWorkout: () => set(() => ({ ...initialState })),

    setCurrentDate: (date) =>
      set((state) => {
        state.currentDate = date;
      }),

    setLoading: (v) =>
      set((state) => {
        state.isLoading = v;
      }),

    setError: (v) =>
      set((state) => {
        state.error = v;
      }),
  }))
);
