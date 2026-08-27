/**
 * Esquemas Zod para validar en tiempo de ejecución los tipos de dominio
 * definidos en `../types/index.js` — usados sobre todo al recibir input de
 * formularios (web/mobile), donde el tipado de TypeScript por sí solo no
 * protege frente a datos malformados.
 */
import { z } from "zod";
import { ExerciseType, GoalType } from "../types/index.js";

// ─── Primitives ───────────────────────────────────────────────────────────────

/** Unidad de peso: kilogramos o libras. */
export const weightUnitSchema = z.enum(["kg", "lb"]);

/** Valida cualquier valor del enum `ExerciseType` (tipos base y avanzados). */
export const exerciseTypeSchema = z.nativeEnum(ExerciseType);

/** Valida cualquier valor del enum `GoalType` (INCREASE/DECREASE/SPECIFIC). */
export const goalTypeSchema = z.nativeEnum(GoalType);

// ─── Domain schemas ───────────────────────────────────────────────────────────

/** Valida una `Category` completa; `color` debe ser un hex de 6 dígitos (`#RRGGBB`). */
export const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order_index: z.number().int().nonnegative(),
});

/** Valida un `Exercise` completo, incluida su fecha de creación en formato ISO datetime. */
export const exerciseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  category_id: z.string().uuid(),
  type: exerciseTypeSchema,
  weight_unit: weightUnitSchema,
  notes: z.string().max(1000).optional(),
  is_favorite: z.boolean(),
  created_at: z.string().datetime(),
  demo_url: z.string().url().max(2000).optional(),
});

/** Valida un `Workout` completo; a diferencia de los timestamps, `date` es solo YYYY-MM-DD (sin hora). */
export const workoutSchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comment: z.string().max(2000).optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  duration_minutes: z.number().int().nonnegative().optional(),
});

/** Valida la relación ejercicio-dentro-de-entrenamiento; `group_id` es el identificador compartido usado para agrupar supersets. */
export const workoutExerciseSchema = z.object({
  id: z.string().uuid(),
  workout_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  order_index: z.number().int().nonnegative(),
  group_id: z.string().uuid().optional(),
});

/** Valida un set (serie) de un ejercicio: qué campos son obligatorios depende del `ExerciseType` del ejercicio, por eso aquí casi todos son opcionales. */
export const setSchema = z.object({
  id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  weight: z.number().nonnegative().optional(),
  reps: z.number().int().positive().optional(),
  distance: z.number().nonnegative().optional(),
  time_seconds: z.number().int().nonnegative().optional(),
  is_complete: z.boolean(),
  comment: z.string().max(500).optional(),
  order_index: z.number().int().nonnegative(),
});

/** Valida un récord personal (PR) de un ejercicio (peso × reps alcanzados). */
export const personalRecordSchema = z.object({
  id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  reps: z.number().int().positive(),
  weight: z.number().nonnegative(),
  achieved_at: z.string().datetime(),
});

/** Valida una `Routine` (rutina de entrenamiento) sin sus días. */
export const routineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
});

/** Valida un día de una rutina (p. ej. "Día de pierna"). */
export const routineDaySchema = z.object({
  id: z.string().uuid(),
  routine_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  order_index: z.number().int().nonnegative(),
});

/** Valida un ejercicio dentro de un día de rutina; `group_id` agrupa supersets igual que en `workoutExerciseSchema`. */
export const routineDayExerciseSchema = z.object({
  id: z.string().uuid(),
  routine_day_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  order_index: z.number().int().nonnegative(),
  group_id: z.string().uuid().optional(),
});

/** Valida un set predefinido (plantilla de peso/reps/distancia/tiempo) asociado a un ejercicio de una rutina. */
export const predefinedSetSchema = z.object({
  id: z.string().uuid(),
  routine_day_exercise_id: z.string().uuid(),
  weight: z.number().nonnegative().optional(),
  reps: z.number().int().positive().optional(),
  distance: z.number().nonnegative().optional(),
  time_seconds: z.number().int().nonnegative().optional(),
  order_index: z.number().int().nonnegative(),
});

/** Valida una medida corporal configurable (peso, cintura, etc.) junto con su objetivo (`goal_type`/`goal_value`). */
export const bodyMeasurementSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  unit: z.string().min(1).max(20),
  goal_type: goalTypeSchema,
  goal_value: z.number().optional(),
  is_enabled: z.boolean(),
  is_default: z.boolean(),
});

/** Valida una entrada registrada en el tiempo para una medida corporal. */
export const bodyMeasurementEntrySchema = z.object({
  id: z.string().uuid(),
  measurement_id: z.string().uuid(),
  value: z.number(),
  comment: z.string().max(500).optional(),
  recorded_at: z.string().datetime(),
});

// ─── Form input schemas (no id/timestamps — used for create forms) ────────────

/** Input de creación de un `Exercise`: sin `id` (se genera en cliente vía `generateUUID`) ni `created_at` (se fija al insertar). */
export const createExerciseInputSchema = exerciseSchema.omit({
  id: true,
  created_at: true,
});

/** Input de creación de un `Set`: igual que `setSchema` sin `id`. */
export const createSetInputSchema = setSchema.omit({ id: true });

/** Input de creación de una `Routine`: igual que `routineSchema` sin `id`. */
export const createRoutineInputSchema = routineSchema.omit({ id: true });

/** Input de creación de una `BodyMeasurementEntry`: igual que el esquema completo sin `id`. */
export const createBodyMeasurementEntryInputSchema =
  bodyMeasurementEntrySchema.omit({ id: true });

// ─── Type exports from schemas ────────────────────────────────────────────────

/** Tipo inferido de `categorySchema` (incluye `id`, a diferencia de los `*Input` de creación). */
export type CategoryInput = z.infer<typeof categorySchema>;
/** Tipo inferido de `createExerciseInputSchema` (sin `id`/`created_at`). */
export type ExerciseInput = z.infer<typeof createExerciseInputSchema>;
/** Tipo inferido de `createSetInputSchema` (sin `id`). */
export type SetInput = z.infer<typeof createSetInputSchema>;
/** Tipo inferido de `createRoutineInputSchema` (sin `id`). */
export type RoutineInput = z.infer<typeof createRoutineInputSchema>;
/** Tipo inferido de `createBodyMeasurementEntryInputSchema` (sin `id`). */
export type BodyMeasurementEntryInput = z.infer<
  typeof createBodyMeasurementEntryInputSchema
>;
