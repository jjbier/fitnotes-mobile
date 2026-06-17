import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Workout, WorkoutExercise, Set } from "../types/index.js";

interface WorkoutState {
  currentDate: string;
  activeWorkout: Workout | null;
  exercises: WorkoutExercise[];
  sets: Record<string, Set[]>;
  activeExerciseId: string | null;
  workouts: Workout[];
  isLoading: boolean;
  error: string | null;
}

interface WorkoutActions {
  startWorkout: (date: string) => void;
  loadWorkout: (workout: Workout, exercises: WorkoutExercise[], sets: Record<string, Set[]>) => void;
  loadWorkouts: (workouts: Workout[]) => void;
  addWorkoutToHistory: (workout: Workout) => void;
  addExerciseToWorkout: (exerciseId: string) => void;
  createSet: (workoutExerciseId: string, partial?: Partial<Set>) => void;
  updateSet: (workoutExerciseId: string, setId: string, patch: Partial<Set>) => void;
  deleteSet: (workoutExerciseId: string, setId: string) => void;
  markSetComplete: (workoutExerciseId: string, setId: string, complete: boolean) => void;
  reorderExercises: (orderedIds: string[]) => void;
  setActiveExercise: (exerciseId: string | null) => void;
  setWorkoutComment: (comment: string) => void;
  groupExercises: (weId1: string, weId2: string) => void;
  ungroupExercise: (weId: string) => void;
  finishWorkout: () => void;
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

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useWorkoutStore = create<WorkoutStore>()(
  immer((set) => ({
    ...initialState,

    startWorkout: (date) =>
      set((state) => {
        state.activeWorkout = {
          id: generateId(),
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

    addExerciseToWorkout: (exerciseId) =>
      set((state) => {
        if (!state.activeWorkout) return;
        const entry: WorkoutExercise = {
          id: generateId(),
          workout_id: state.activeWorkout.id,
          exercise_id: exerciseId,
          order_index: state.exercises.length,
        };
        state.exercises.push(entry);
        state.sets[entry.id] = [];
        state.activeExerciseId = exerciseId;
      }),

    createSet: (workoutExerciseId, partial = {}) =>
      set((state) => {
        const existingSets = state.sets[workoutExerciseId] ?? [];
        const newSet: Set = {
          id: generateId(),
          workout_exercise_id: workoutExerciseId,
          is_complete: false,
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

    groupExercises: (weId1, weId2) =>
      set((state) => {
        const groupId = generateId();
        for (const ex of state.exercises) {
          if (ex.id === weId1 || ex.id === weId2) ex.group_id = groupId;
        }
      }),

    ungroupExercise: (weId) =>
      set((state) => {
        const ex = state.exercises.find((e) => e.id === weId);
        if (ex) ex.group_id = undefined;
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
