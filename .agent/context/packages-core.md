# packages/core — @fitnotes/core

_Last updated: 2026-06-22_

**Regla absoluta:** cero imports de `react`, `next`, `expo`, `react-native`. Solo TypeScript puro + zustand + zod + immer.

## Tipos (`src/types/index.ts`)

```
ExerciseType enum  WEIGHT_REPS | DISTANCE_TIME | REPS_ONLY | WEIGHT_ONLY | TIME_ONLY
WeightUnit         "kg" | "lb"

Interfaces: Category, Exercise, Workout, WorkoutExercise, Set,
            PersonalRecord, Routine, RoutineDay, RoutineDayExercise,
            PredefinedSet, BodyMeasurement, BodyMeasurementEntry
```

## Stores

### `useWorkoutStore`
- State: `currentDate`, `activeWorkout`, `exercises: WorkoutExercise[]`, `sets: Record<string, Set[]>`, `activeExerciseId`, `workouts: Workout[]`
- Actions clave:
  - `startWorkout(date)` — genera ID local temporal
  - `loadWorkout(workout, exercises, sets)` — reemplaza estado completo (usar tras fetch DB)
  - `loadWorkouts(workouts)` — carga historial
  - `addExerciseToWorkout(exerciseId, weId?)` — **weId debe ser el UUID real de DB**
  - `removeExerciseFromWorkout(workoutExerciseId)` — elimina de exercises[] y sets{}
  - `removeWorkoutFromHistory(workoutId)` — elimina de workouts[]
  - `createSet`, `updateSet`, `deleteSet`, `markSetComplete`
  - `finishWorkout` — sets end_time + duration_minutes

### `useExerciseStore`
- State: `categories`, `exercises`, `isLoading`, `error`
- Actions: `loadExercises(categories, exercises)`, `addExercise`, `updateExercise`, `deleteExercise`, `toggleFavorite`, `addCategory`

### `useProgressStore`
- State: `personalRecords: Record<exerciseId, PersonalRecord[]>`
- `calculateEstimated1RM(exerciseId)` → Brzycki, máximo entre todos los PRs

### `useRoutineStore`
- State: `routines`, `routineDays`, `routineDayExercises`
- `logRoutineWorkout()` — implementado en `routines/[id].tsx` (no en el store)

## Utils

```ts
calculate1RM(weight, reps)     // Brzycki: weight * (36 / (37 - reps)); guard reps≥37
estimateRepMax(oneRM, reps)    // Inverso Brzycki
calculateVolume(sets)          // Suma weight*reps completados
calculatePace(distKm, timeS)   // s/km
calculateSpeed(distKm, timeS)  // km/h
formatWorkoutDate(dateStr)     // "Mon, June 16, 2026"
todayISO()                     // "YYYY-MM-DD"
getWeekRange(dateStr)          // { start, end } lun→dom
groupWorkoutsByMonth(workouts) // Record<"Month YYYY", Workout[]>
```

## Tests (144 total)

- `exerciseStore.test.ts` — CRUD ejercicios y categorías
- `workoutStore.test.ts` — workout lifecycle, sets, agrupaciones
- `exerciseTypeCrud.test.ts` — **CRUD completo para los 5 ExerciseTypes** (WEIGHT_REPS, DISTANCE_TIME, REPS_ONLY, WEIGHT_ONLY, TIME_ONLY)
- `progressStore.test.ts` — PRs y 1RM
- `routineStore.test.ts` — rutinas y días
- `utils.test.ts` — calculate1RM, formatWorkoutDate, etc.
