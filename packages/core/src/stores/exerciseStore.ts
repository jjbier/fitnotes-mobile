/**
 * Store Zustand de categorías y ejercicios. Mantiene `favorites` (ids de
 * ejercicios con `is_favorite`) como lista derivada que cada acción debe
 * mantener manualmente en sync — no se recalcula automáticamente a partir
 * de `exercises` salvo en `loadExercises`.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Category, Exercise } from "../types/index.js";

interface ExerciseState {
  categories: Category[];
  exercises: Exercise[];
  /** ids de ejercicios favoritos; derivado de `exercises[].is_favorite`, mantenido en sync manualmente por cada acción. */
  favorites: string[];
  isLoading: boolean;
  error: string | null;
}

interface ExerciseActions {
  /** Reemplaza la lista completa de categorías. */
  loadCategories: (categories: Category[]) => void;
  /** Reemplaza categorías y ejercicios a la vez, recalculando `favorites` desde `is_favorite`. */
  loadExercises: (categories: Category[], exercises: Exercise[]) => void;
  /** Añade un ejercicio; si nace favorito, lo añade también a `favorites`. */
  addExercise: (exercise: Exercise) => void;
  /** Mergea un patch parcial sobre el ejercicio con ese id. No sincroniza `favorites` (usar `toggleFavorite` para eso). */
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  /** Elimina el ejercicio del store y de `favorites`. No cascada sobre workouts/rutinas — eso es responsabilidad del repositorio. */
  deleteExercise: (id: string) => void;
  /** Alterna `is_favorite` del ejercicio y mantiene `favorites` en sync. */
  toggleFavorite: (id: string) => void;
  /** Añade una categoría al final de la lista. */
  addCategory: (category: Category) => void;
  /** Mergea un patch parcial sobre la categoría con ese id. */
  updateCategory: (id: string, patch: Partial<Category>) => void;
  /** Elimina la categoría y quita del store los ejercicios que le pertenecían (solo estado en memoria; el repositorio real reasigna `category_id` a null en vez de borrarlos, ver `deleteCategory`). */
  deleteCategory: (id: string) => void;
  /** Reordena las categorías según la lista de ids dada, reescribiendo `order_index` secuencialmente. */
  reorderCategories: (orderedIds: string[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

type ExerciseStore = ExerciseState & ExerciseActions;

/** Store combinado (estado + acciones) de categorías y ejercicios, con Immer para mutaciones ergonómicas. */
export const useExerciseStore = create<ExerciseStore>()(
  immer((set) => ({
    categories: [],
    exercises: [],
    favorites: [],
    isLoading: false,
    error: null,

    loadCategories: (categories) =>
      set((state) => {
        state.categories = categories;
      }),

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
        if (exercise.is_favorite) state.favorites.push(exercise.id);
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
        state.exercises = state.exercises.filter((e) => e.category_id !== id);
      }),

    reorderCategories: (orderedIds) =>
      set((state) => {
        state.categories = orderedIds
          .map((id, idx) => {
            const cat = state.categories.find((c) => c.id === id);
            return cat ? { ...cat, order_index: idx } : null;
          })
          .filter((c): c is Category => c !== null);
      }),

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),

    setError: (error) =>
      set((state) => {
        state.error = error;
      }),
  }))
);
