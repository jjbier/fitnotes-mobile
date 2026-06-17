# Stores — @fitnotes/core

All stores use Zustand 5 + Immer. Imported via `@fitnotes/core`.
Stores hold in-memory state only — no persistence to Supabase/SQLite yet.

## useWorkoutStore
```ts
// State
currentWorkout: Workout | null
exercises: WorkoutExercise[]
sets: Record<string, Set[]>        // keyed by workoutExerciseId
workouts: Workout[]
isLoading: boolean
error: string | null

// Actions
setCurrentWorkout(workout)
addExercise(exercise)
removeExercise(workoutExerciseId)
addSet(workoutExerciseId, set)
updateSet(workoutExerciseId, setId, updates)
deleteSet(workoutExerciseId, setId)
loadWorkout(workout, exercises, sets)
loadWorkouts(workouts)
addWorkoutToHistory(workout)
setWorkoutComment(comment)
groupExercises(weId1, weId2)
ungroupExercise(weId)
setCurrentDate(date)
setLoading(bool)
setError(msg)
```

## useExerciseStore
```ts
// State
categories: Category[]
exercises: Exercise[]
isLoading: boolean
error: string | null

// Actions
setCategories(categories)
addCategory(category)
updateCategory(id, updates)
deleteCategory(id)
setExercises(exercises)
addExercise(exercise)
updateExercise(id, updates)
deleteExercise(id)
setLoading(bool)
setError(msg)
```

## useProgressStore
```ts
// State
personalRecords: PersonalRecord[]
chartData: Record<string, ChartPoint[]>   // keyed by exerciseId
isLoading: boolean
error: string | null

// Actions
setPersonalRecords(records)
updatePersonalRecord(record)
loadChartData(exerciseId, points)
setLoading(bool)
setError(msg)
```

## useRoutineStore
```ts
// State
routines: Routine[]
days: Record<string, RoutineDay[]>           // keyed by routineId
exercises: Record<string, RoutineDayExercise[]>  // keyed by dayId
predefinedSets: Record<string, PredefinedSet[]>  // keyed by rdExerciseId
isLoading: boolean
error: string | null

// Actions
setRoutines(routines)
addRoutine(routine)
updateRoutine(id, updates)
deleteRoutine(id)
loadRoutineDays(routineId, days)
loadRoutineDayExercises(dayId, exercises)
loadPredefinedSets(rdExerciseId, sets)
copyRoutine(routine)
reorderDays(routineId, days)
reorderExercisesInDay(dayId, exercises)
savePredefinedSets(rdExerciseId, sets)
logRoutineWorkout(routineId, dayId)    // EMPTY — not implemented
setLoading(bool)
setError(msg)
```
