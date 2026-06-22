# Stores — @fitnotes/core

_Last updated: 2026-06-22_

Zustand 5 + Immer. Importados via `@fitnotes/core`. Estado en memoria — Supabase es la fuente de verdad.

## useWorkoutStore

```ts
// State
activeWorkout: Workout | null
exercises: WorkoutExercise[]       // workout_exercises del workout activo
sets: Record<string, Set[]>        // keyed by workoutExerciseId
workouts: Workout[]                // historial reciente
isLoading: boolean

// Actions clave
startWorkout(date)                           // crea workout local (ID temporal)
loadWorkout(workout, exercises, sets)        // reemplaza estado desde DB
loadWorkouts(workouts)                       // carga historial
addExerciseToWorkout(exerciseId, weId?)      // weId = UUID real de DB (crítico)
removeExerciseFromWorkout(workoutExerciseId) // optimistic delete
removeWorkoutFromHistory(workoutId)
createSet(workoutExerciseId, partial?)
updateSet(workoutExerciseId, setId, patch)
deleteSet(workoutExerciseId, setId)
markSetComplete(workoutExerciseId, setId, complete)
finishWorkout()                              // sets end_time + duration_minutes
```

## useExerciseStore

```ts
// State
categories: Category[]
exercises: Exercise[]
isLoading: boolean

// Actions
loadExercises(categories, exercises)
addExercise(exercise)
updateExercise(id, updates)
deleteExercise(id)
toggleFavorite(id)
addCategory(category)
```

## useProgressStore

```ts
// State
personalRecords: Record<exerciseId, PersonalRecord[]>
isLoading: boolean

// Actions
loadPersonalRecords(exerciseId, records)
calculateEstimated1RM(exerciseId)  // Brzycki, máx entre todos los PRs
```

## useRoutineStore

```ts
// State
routines: Routine[]
routineDays: Record<routineId, RoutineDay[]>
routineDayExercises: Record<dayId, RoutineDayExercise[]>
predefinedSets: Record<rdExerciseId, PredefinedSet[]>

// Actions
loadRoutines, createRoutine, updateRoutine, deleteRoutine
loadRoutineDays, addRoutineDay, deleteRoutineDay
loadDayExercises, addExerciseToDay, removeExerciseFromDay
loadPredefinedSets, setPredefinedSets
```

**Nota:** `logRoutineWorkout()` está implementado en `routines/[id].tsx` directamente, no en el store.
