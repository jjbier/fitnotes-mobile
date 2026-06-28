export enum ExerciseType {
  // Base types
  WEIGHT_REPS = "WEIGHT_REPS",
  DISTANCE_TIME = "DISTANCE_TIME",
  REPS_ONLY = "REPS_ONLY",
  WEIGHT_ONLY = "WEIGHT_ONLY",
  TIME_ONLY = "TIME_ONLY",
  // Advanced types
  WEIGHT_DISTANCE = "WEIGHT_DISTANCE",
  WEIGHT_TIME = "WEIGHT_TIME",
  REPS_DISTANCE = "REPS_DISTANCE",
  REPS_TIME = "REPS_TIME",
  DISTANCE_ONLY = "DISTANCE_ONLY",
}

export enum GoalType {
  INCREASE = "INCREASE",
  DECREASE = "DECREASE",
  SPECIFIC = "SPECIFIC",
}

export type WeightUnit = "kg" | "lb";

export interface Category {
  id: string;
  name: string;
  color: string;
  order_index: number;
}

export interface Exercise {
  id: string;
  name: string;
  category_id: string;
  type: ExerciseType;
  weight_unit: WeightUnit;
  notes?: string;
  is_favorite: boolean;
  created_at: string;
  weight_increment?: number;
  default_rest_seconds?: number;
  default_chart?: "weight" | "volume" | "reps";
}

export interface Workout {
  id: string;
  date: string; // ISO date string YYYY-MM-DD
  comment?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  order_index: number;
  group_id?: string;
  group_name?: string;
}

export interface Set {
  id: string;
  workout_exercise_id: string;
  weight?: number;
  reps?: number;
  distance?: number;
  time_seconds?: number;
  is_complete: boolean;
  is_warmup: boolean;
  comment?: string;
  order_index: number;
}

export interface PersonalRecord {
  id: string;
  exercise_id: string;
  reps: number;
  weight: number;
  achieved_at: string;
}

export interface Routine {
  id: string;
  name: string;
  notes?: string;
}

export interface RoutineDay {
  id: string;
  routine_id: string;
  name: string;
  order_index: number;
}

export interface RoutineDayExercise {
  id: string;
  routine_day_id: string;
  exercise_id: string;
  order_index: number;
  group_id?: string;
}

export interface PredefinedSet {
  id: string;
  routine_day_exercise_id: string;
  weight?: number;
  reps?: number;
  distance?: number;
  time_seconds?: number;
  order_index: number;
}

export interface ExerciseGoal {
  id: string;
  exercise_id: string;
  target_weight?: number;
  target_reps?: number;
  target_date?: string;
  notes?: string;
  achieved_at?: string;
  created_at: string;
}

export interface BodyMeasurement {
  id: string;
  name: string;
  unit: string;
  goal_type: GoalType;
  goal_value?: number;
  is_enabled: boolean;
  is_default: boolean;
}

export interface BodyMeasurementEntry {
  id: string;
  measurement_id: string;
  value: number;
  comment?: string;
  recorded_at: string;
}
