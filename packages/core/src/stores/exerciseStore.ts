import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Category, Exercise } from "../types/index.js";

interface ExerciseState {
  categories: Category[];
  exercises: Exercise[];
  favorites: string[];
}

interface ExerciseActions {
  loadExercises: (categories: Category[], exercises: Exercise[]) => void;
  addExercise: (exercise: Exercise) => void;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  deleteExercise: (id: string) => void;
  toggleFavorite: (id: string) => void;
  addCategory: (category: Category) => void;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
}

type ExerciseStore = ExerciseState & ExerciseActions;

export const useExerciseStore = create<ExerciseStore>()(
  immer((set) => ({
    categories: [],
    exercises: [],
    favorites: [],

    loadExercises: (categories, exercises) =>
      set((state) => {
        state.categories = categories;
        state.exercises = exercises;
        state.favorites = exercises
          .filter((e) => e.is_favorite)
          .map((e) => e.id);
      }),

    addExercise: (exercise) =>
      set((state) => {
        state.exercises.push(exercise);
      }),

    updateExercise: (id, patch) =>
      set((state) => {
        const idx = state.exercises.findIndex((e) => e.id === id);
        if (idx !== -1) Object.assign(state.exercises[idx]!, patch);
      }),

    deleteExercise: (id) =>
      set((state) => {
        state.exercises = state.exercises.filter((e) => e.id !== id);
        state.favorites = state.favorites.filter((fid) => fid !== id);
      }),

    toggleFavorite: (id) =>
      set((state) => {
        const idx = state.favorites.indexOf(id);
        if (idx === -1) {
          state.favorites.push(id);
        } else {
          state.favorites.splice(idx, 1);
        }
        const exercise = state.exercises.find((e) => e.id === id);
        if (exercise) exercise.is_favorite = idx === -1;
      }),

    addCategory: (category) =>
      set((state) => {
        state.categories.push(category);
      }),

    updateCategory: (id, patch) =>
      set((state) => {
        const idx = state.categories.findIndex((c) => c.id === id);
        if (idx !== -1) Object.assign(state.categories[idx]!, patch);
      }),

    deleteCategory: (id) =>
      set((state) => {
        state.categories = state.categories.filter((c) => c.id !== id);
      }),
  }))
);
