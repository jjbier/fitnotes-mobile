# packages/core — @fitnotes/core

**Regla absoluta:** cero imports de `react`, `next`, `expo`, `react-native`. Solo TypeScript puro + zustand + zod + immer.

## Tipos (`src/types/index.ts`)

```
ExerciseType enum  WEIGHT_REPS | DISTANCE_TIME | REPS_ONLY | WEIGHT_ONLY | TIME_ONLY
GoalType enum      INCREASE | DECREASE | SPECIFIC
WeightUnit         "kg" | "lb"

Interfaces: Category, Exercise, Workout, WorkoutExercise, Set,
            PersonalRecord, Routine, RoutineDay, RoutineDayExercise,
            PredefinedSet, BodyMeasurement, BodyMeasurementEntry
```

## Stores

### `useWorkoutStore`
- State: `currentDate`, `activeWorkout`, `exercises: WorkoutExercise[]`, `sets: Record<string, Set[]>`, `activeExerciseId`
- Actions: `startWorkout(date)`, `addExerciseToWorkout(exerciseId)`, `createSet(workoutExerciseId, partial?)`, `updateSet`, `deleteSet`, `markSetComplete`, `reorderExercises(orderedIds)`, `setActiveExercise`, `finishWorkout`, `resetWorkout`
- IDs generados localmente: `${Date.now()}-${Math.random().toString(36).slice(2,9)}`

### `useExerciseStore`
- State: `categories`, `exercises`, `favorites: string[]`
- Actions: `loadExercises`, `addExercise`, `updateExercise`, `deleteExercise`, `toggleFavorite`, `addCategory`, `updateCategory`, `deleteCategory`

### `useProgressStore`
- State: `personalRecords: Record<string, PersonalRecord[]>`, `goals`
- `calculateEstimated1RM(exerciseId)` → usa Brzycki, devuelve el máximo entre todos los PRs del ejercicio
- Actions: `loadPersonalRecords`, `addPersonalRecord`, `setGoal`, `removeGoal`

### `useRoutineStore`
- State: `routines`, `routineDays: Record<routineId, RoutineDay[]>`, `routineDayExercises: Record<dayId, RoutineDayExercise[]>`, `activeRoutineId`
- Actions: `loadRoutines`, `createRoutine`, `updateRoutine`, `deleteRoutine`, `addRoutineDay`, `addExerciseToDay`, etc.
- `logRoutineWorkout()` — VACÍO, pendiente dispatch a workoutStore

## Utils

```ts
calculate1RM(weight, reps)            // Brzycki: weight * (36 / (37 - reps)); guard reps≥37
estimateRepMax(oneRM, reps)           // Inverso Brzycki
calculateVolume(sets)                 // Suma weight*reps de sets completados
calculatePace(distanceKm, timeS)      // segundos/km
calculateSpeed(distanceKm, timeS)     // km/h
formatWorkoutDate(dateStr)            // "Mon, June 16, 2026"
getWeekRange(dateStr)                 // { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } lun→dom
groupWorkoutsByMonth(workouts)        // Record<"Month YYYY", Workout[]>
todayISO()                            // "YYYY-MM-DD"
daysBetween(a, b)                     // número de días
```

## Schemas Zod (`src/schemas/index.ts`)

Schemas para los 12 tipos del dominio + variantes de input para forms:
- `createExerciseInputSchema` — sin `id` ni `created_at`
- `createSetInputSchema` — sin `id`
- `createRoutineInputSchema` — sin `id`
- `createBodyMeasurementEntryInputSchema` — sin `id`
