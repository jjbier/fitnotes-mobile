/**
 * Punto de entrada de `@fitnotes/core`: lógica pura (sin dependencias de
 * React/Next/Expo) compartida entre `apps/web` y `apps/mobile` — tipos de
 * dominio, stores Zustand, utilidades de cálculo/fecha/UUID y esquemas Zod
 * de validación.
 */

// Types
export * from "./types/index.js";

// Stores
export { useWorkoutStore } from "./stores/workoutStore.js";
export { useExerciseStore } from "./stores/exerciseStore.js";
export { useProgressStore } from "./stores/progressStore.js";
export { useRoutineStore } from "./stores/routineStore.js";
export { useBodyTrackerStore } from "./stores/bodyTrackerStore.js";
export { usePreferencesStore } from "./stores/preferencesStore.js";

// Utils
export * from "./utils/calculations.js";
export * from "./utils/dateUtils.js";
export * from "./utils/filterUtils.js";
export * from "./utils/uuid.js";
export * from "./utils/personalRecords.js";

// Schemas
export * from "./schemas/index.js";
