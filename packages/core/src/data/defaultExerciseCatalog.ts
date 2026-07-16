/**
 * Catálogo de categorías y ejercicios por defecto (7 categorías, 85 ejercicios),
 * usado por el botón "Importar catálogo por defecto" de Settings (web y
 * mobile) para poblar una cuenta nueva o vacía. Fuente: `fixtures` en la raíz
 * del repo (lista de referencia de la app FitNotes original).
 */
import { ExerciseType } from "../types/index.js";

/** Un ejercicio del catálogo por defecto, con el tipo que determina qué campos registra (ver `ExerciseType`). */
export interface DefaultCatalogExercise {
  name: string;
  type: ExerciseType;
}

/** Una categoría del catálogo por defecto y sus ejercicios. */
export interface DefaultCatalogCategory {
  name: string;
  exercises: DefaultCatalogExercise[];
}

const { WEIGHT_REPS, REPS_ONLY, TIME_ONLY, DISTANCE_TIME } = ExerciseType;

export const DEFAULT_EXERCISE_CATALOG: DefaultCatalogCategory[] = [
  {
    name: "Abs",
    exercises: [
      { name: "Ab-Wheel Rollout", type: REPS_ONLY },
      { name: "Cable Crunch", type: WEIGHT_REPS },
      { name: "Crunch", type: REPS_ONLY },
      { name: "Crunch Machine", type: WEIGHT_REPS },
      { name: "Decline Crunch", type: REPS_ONLY },
      { name: "Dragon Flag", type: REPS_ONLY },
      { name: "Hanging Knee Raise", type: REPS_ONLY },
      { name: "Hanging Leg Raise", type: REPS_ONLY },
      { name: "Plank", type: TIME_ONLY },
      { name: "Side Plank", type: TIME_ONLY },
    ],
  },
  {
    name: "Back",
    exercises: [
      { name: "Barbell Row", type: WEIGHT_REPS },
      { name: "Barbell Shrug", type: WEIGHT_REPS },
      { name: "Chin Up", type: REPS_ONLY },
      { name: "Deadlift", type: WEIGHT_REPS },
      { name: "Dumbbell Row", type: WEIGHT_REPS },
      { name: "Good Morning", type: WEIGHT_REPS },
      { name: "Hammer Strength Row", type: WEIGHT_REPS },
      { name: "Lat Pulldown", type: WEIGHT_REPS },
      { name: "Machine Shrug", type: WEIGHT_REPS },
      { name: "Neutral Chin Up", type: REPS_ONLY },
      { name: "Pendlay Row", type: WEIGHT_REPS },
      { name: "Pull Up", type: REPS_ONLY },
      { name: "Rack Pull", type: WEIGHT_REPS },
      { name: "Seated Cable Row", type: WEIGHT_REPS },
      { name: "Straight-Arm Cable Pushdown", type: WEIGHT_REPS },
      { name: "T-Bar Row", type: WEIGHT_REPS },
    ],
  },
  {
    name: "Biceps",
    exercises: [
      { name: "Barbell Curl", type: WEIGHT_REPS },
      { name: "Cable Curl", type: WEIGHT_REPS },
      { name: "Dumbbell Concentration Curl", type: WEIGHT_REPS },
      { name: "Dumbbell Curl", type: WEIGHT_REPS },
      { name: "Dumbbell Hammer Curl", type: WEIGHT_REPS },
      { name: "Dumbbell Preacher Curl", type: WEIGHT_REPS },
      { name: "EZ-Bar Curl", type: WEIGHT_REPS },
      { name: "EZ-Bar Preacher Curl", type: WEIGHT_REPS },
      { name: "Seated Incline Dumbbell Curl", type: WEIGHT_REPS },
      { name: "Seated Machine Curl", type: WEIGHT_REPS },
    ],
  },
  {
    name: "Cardio",
    exercises: [
      { name: "Cycling", type: DISTANCE_TIME },
      { name: "Elliptical Trainer", type: DISTANCE_TIME },
      { name: "Rowing Machine", type: DISTANCE_TIME },
      { name: "Running (Outdoor)", type: DISTANCE_TIME },
      { name: "Running (Treadmill)", type: DISTANCE_TIME },
      { name: "Stationary Bike", type: DISTANCE_TIME },
      { name: "Swimming", type: DISTANCE_TIME },
      { name: "Walking", type: DISTANCE_TIME },
    ],
  },
  {
    name: "Chest",
    exercises: [
      { name: "Cable Crossover", type: WEIGHT_REPS },
      { name: "Decline Barbell Bench Press", type: WEIGHT_REPS },
      { name: "Decline Hammer Strength Chest Press", type: WEIGHT_REPS },
      { name: "Flat Barbell Bench Press", type: WEIGHT_REPS },
      { name: "Flat Dumbbell Bench Press", type: WEIGHT_REPS },
      { name: "Flat Dumbbell Fly", type: WEIGHT_REPS },
      { name: "Incline Barbell Bench Press", type: WEIGHT_REPS },
      { name: "Incline Dumbbell Bench Press", type: WEIGHT_REPS },
      { name: "Incline Dumbbell Fly", type: WEIGHT_REPS },
      { name: "Incline Hammer Strength Chest Press", type: WEIGHT_REPS },
      { name: "Seated Machine Fly", type: WEIGHT_REPS },
    ],
  },
  {
    name: "Leg",
    exercises: [
      { name: "Barbell Calf Raise", type: WEIGHT_REPS },
      { name: "Barbell Front Squat", type: WEIGHT_REPS },
      { name: "Barbell Glute Bridge", type: WEIGHT_REPS },
      { name: "Barbell Squat", type: WEIGHT_REPS },
      { name: "Donkey Calf Raise", type: WEIGHT_REPS },
      { name: "Glute-Ham Raise", type: REPS_ONLY },
      { name: "Leg Extension Machine", type: WEIGHT_REPS },
      { name: "Leg Press", type: WEIGHT_REPS },
      { name: "Lying Leg Curl Machine", type: WEIGHT_REPS },
      { name: "Romanian Deadlift", type: WEIGHT_REPS },
      { name: "Seated Calf Raise Machine", type: WEIGHT_REPS },
      { name: "Seated Leg Curl Machine", type: WEIGHT_REPS },
      { name: "Standing Calf Raise Machine", type: WEIGHT_REPS },
      { name: "Stiff-Legged Deadlift", type: WEIGHT_REPS },
      { name: "Sumo Deadlift", type: WEIGHT_REPS },
    ],
  },
  {
    name: "Shoulders",
    exercises: [
      { name: "Arnold Dumbbell Press", type: WEIGHT_REPS },
      { name: "Behind The Neck Barbell Press", type: WEIGHT_REPS },
      { name: "Cable Face Pull", type: WEIGHT_REPS },
      { name: "Front Dumbbell Raise", type: WEIGHT_REPS },
      { name: "Hammer Strength Shoulder Press", type: WEIGHT_REPS },
      { name: "Lateral Dumbbell Raise", type: WEIGHT_REPS },
      { name: "Lateral Machine Raise", type: WEIGHT_REPS },
      { name: "Log Press", type: WEIGHT_REPS },
      { name: "One-Arm Standing Dumbbell Press", type: WEIGHT_REPS },
      { name: "Overhead Press", type: WEIGHT_REPS },
      { name: "Push Press", type: WEIGHT_REPS },
      { name: "Rear Delt Dumbbell Raise", type: WEIGHT_REPS },
      { name: "Rear Delt Machine Fly", type: WEIGHT_REPS },
      { name: "Seated Dumbbell Lateral Raise", type: WEIGHT_REPS },
      { name: "Seated Dumbbell Press", type: WEIGHT_REPS },
      { name: "Smith Machine Overhead Press", type: WEIGHT_REPS },
    ],
  },
  {
    name: "Triceps",
    exercises: [
      { name: "Cable Overhead Triceps Extension", type: WEIGHT_REPS },
      { name: "Close Grip Barbell Bench Press", type: WEIGHT_REPS },
      { name: "Dumbbell Overhead Triceps Extension", type: WEIGHT_REPS },
      { name: "EZ-Bar Skullcrusher", type: WEIGHT_REPS },
      { name: "Lying Triceps Extension", type: WEIGHT_REPS },
      { name: "Parallel Bar Triceps Dip", type: REPS_ONLY },
      { name: "Ring Dip", type: REPS_ONLY },
      { name: "Rope Push Down", type: WEIGHT_REPS },
      { name: "Smith Machine Close Grip Bench Press", type: WEIGHT_REPS },
      { name: "V-Bar Push Down", type: WEIGHT_REPS },
    ],
  },
];
