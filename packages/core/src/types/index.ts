/**
 * Tipos de dominio compartidos entre web y mobile: la fuente de verdad de
 * forma de los datos que fluyen entre stores, repositorios (Supabase y
 * SQLite local) y esquemas de validación Zod (`../schemas/index.js`).
 */
export * from "./preferences.js";

/**
 * Qué combinación de campos (peso/reps/distancia/tiempo) registra un
 * ejercicio. Los 5 tipos base cubren el catálogo original de la app de
 * referencia; los 5 "avanzados" (peso+distancia, peso+tiempo, reps+distancia,
 * reps+tiempo, solo distancia) se añadieron después para ejercicios como
 * remo con lastre o carrera con series. `getExerciseFields` (en
 * `../utils/calculations.js`) traduce cada valor a qué inputs mostrar en la UI.
 */
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

/** Tipo de objetivo para una medida corporal: subir, bajar, o alcanzar un valor concreto. */
export enum GoalType {
  INCREASE = "INCREASE",
  DECREASE = "DECREASE",
  SPECIFIC = "SPECIFIC",
}

export type WeightUnit = "kg" | "lb";

/** Categoría de ejercicios (p. ej. "Pecho", "Espalda"); `order_index` controla el orden de visualización. */
export interface Category {
  id: string;
  name: string;
  color: string;
  order_index: number;
}

/** Ejercicio del catálogo del usuario. */
export interface Exercise {
  id: string;
  name: string;
  category_id: string;
  type: ExerciseType;
  weight_unit: WeightUnit;
  notes?: string;
  is_favorite: boolean;
  created_at: string;
  /** Incremento de peso por defecto al ajustar sets de este ejercicio (p. ej. 2.5 kg); si no se define, se usa la preferencia global. */
  weight_increment?: number;
  /** Segundos de descanso por defecto tras completar un set de este ejercicio; si no se define, se usa la preferencia global. */
  default_rest_seconds?: number;
  /** Métrica que se muestra por defecto al abrir el gráfico de progreso de este ejercicio. */
  default_chart?: "weight" | "volume" | "reps";
  /** URL de una imagen o vídeo que muestra cómo se realiza el ejercicio. */
  demo_url?: string;
}

/** Un entrenamiento (sesión) en una fecha concreta. */
export interface Workout {
  id: string;
  date: string; // ISO date string YYYY-MM-DD
  comment?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
}

/** Un ejercicio dentro de un entrenamiento concreto (una fila por cada vez que aparece, aunque se repita el mismo ejercicio). */
export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  order_index: number;
  /** id compartido entre los `WorkoutExercise` agrupados como superset; ausente si el ejercicio no está agrupado. */
  group_id?: string;
  /** Nombre del superset, compartido por todos los ejercicios con el mismo `group_id`. */
  group_name?: string;
}

/** Una serie (set) de un ejercicio dentro de un entrenamiento. Qué campos aplican depende del `ExerciseType` del ejercicio. */
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

/** Récord personal (PR): el mejor peso levantado para un número de repeticiones dado de un ejercicio. */
export interface PersonalRecord {
  id: string;
  exercise_id: string;
  reps: number;
  weight: number;
  achieved_at: string;
}

/** Rutina de entrenamiento: agrupa uno o más `RoutineDay`. */
export interface Routine {
  id: string;
  name: string;
  notes?: string;
}

/** Un día dentro de una rutina (p. ej. "Día de pierna"). */
export interface RoutineDay {
  id: string;
  routine_id: string;
  name: string;
  order_index: number;
}

/** Un ejercicio planificado dentro de un día de rutina, con soporte de supersets igual que `WorkoutExercise`. */
export interface RoutineDayExercise {
  id: string;
  routine_day_id: string;
  exercise_id: string;
  order_index: number;
  group_id?: string;
  group_name?: string;
}

/** Set predefinido (plantilla de peso/reps/distancia/tiempo) para un ejercicio de una rutina; al loguear el día, se convierte en un `Set` real. */
export interface PredefinedSet {
  id: string;
  routine_day_exercise_id: string;
  weight?: number;
  reps?: number;
  distance?: number;
  time_seconds?: number;
  order_index: number;
}

/** Objetivo de progreso del usuario para un ejercicio (peso y/o reps objetivo, con fecha límite opcional). */
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

/** Medida corporal configurable por el usuario (peso, cintura, etc.), con su propio objetivo. */
export interface BodyMeasurement {
  id: string;
  name: string;
  unit: string;
  goal_type: GoalType;
  goal_value?: number;
  is_enabled: boolean;
  is_default: boolean;
}

/** Un registro puntual de una medida corporal en el tiempo. */
export interface BodyMeasurementEntry {
  id: string;
  measurement_id: string;
  value: number;
  comment?: string;
  recorded_at: string;
}
