import { z } from "zod";
import { ExerciseType, GoalType } from "../types/index.js";

// ─── Primitives ───────────────────────────────────────────────────────────────

export const weightUnitSchema = z.enum(["kg", "lb"]);

export const exerciseTypeSchema = z.nativeEnum(ExerciseType);

export const goalTypeSchema = z.nativeEnum(GoalType);

// ─── Domain schemas ───────────────────────────────────────────────────────────

export const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order_index: z.number().int().nonnegative(),
});

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  category_id: z.string().uuid(),
  type: exerciseTypeSchema,
  weight_unit: weightUnitSchema,
  notes: z.string().max(1000).optional(),
  is_favorite: z.boolean(),
  created_at: z.string().datetime(),
});

export const workoutSchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comment: z.string().max(2000).optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  duration_minutes: z.number().int().nonnegative().optional(),
});

export const workoutExerciseSchema = z.object({
  id: z.string().uuid(),
  workout_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  order_index: z.number().int().nonnegative(),
  group_id: z.string().uuid().optional(),
});

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

export const personalRecordSchema = z.object({
  id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  reps: z.number().int().positive(),
  weight: z.number().nonnegative(),
  achieved_at: z.string().datetime(),
});

export const routineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
});

export const routineDaySchema = z.object({
  id: z.string().uuid(),
  routine_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  order_index: z.number().int().nonnegative(),
});

export const routineDayExerciseSchema = z.object({
  id: z.string().uuid(),
  routine_day_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  order_index: z.number().int().nonnegative(),
  group_id: z.string().uuid().optional(),
});

export const predefinedSetSchema = z.object({
  id: z.string().uuid(),
  routine_day_exercise_id: z.string().uuid(),
  weight: z.number().nonnegative().optional(),
  reps: z.number().int().positive().optional(),
  distance: z.number().nonnegative().optional(),
  time_seconds: z.number().int().nonnegative().optional(),
  order_index: z.number().int().nonnegative(),
});

export const bodyMeasurementSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  unit: z.string().min(1).max(20),
  goal_type: goalTypeSchema,
  goal_value: z.number().optional(),
  is_enabled: z.boolean(),
  is_default: z.boolean(),
});

export const bodyMeasurementEntrySchema = z.object({
  id: z.string().uuid(),
  measurement_id: z.string().uuid(),
  value: z.number(),
  comment: z.string().max(500).optional(),
  recorded_at: z.string().datetime(),
});

// ─── Form input schemas (no id/timestamps — used for create forms) ────────────

export const createExerciseInputSchema = exerciseSchema.omit({
  id: true,
  created_at: true,
});

export const createSetInputSchema = setSchema.omit({ id: true });

export const createRoutineInputSchema = routineSchema.omit({ id: true });

export const createBodyMeasurementEntryInputSchema =
  bodyMeasurementEntrySchema.omit({ id: true });

// ─── Type exports from schemas ────────────────────────────────────────────────

export type CategoryInput = z.infer<typeof categorySchema>;
export type ExerciseInput = z.infer<typeof createExerciseInputSchema>;
export type SetInput = z.infer<typeof createSetInputSchema>;
export type RoutineInput = z.infer<typeof createRoutineInputSchema>;
export type BodyMeasurementEntryInput = z.infer<
  typeof createBodyMeasurementEntryInputSchema
>;
