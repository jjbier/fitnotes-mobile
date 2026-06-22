# Repositories — @fitnotes/database

_Last updated: 2026-06-22_

Todos exportados desde `packages/database/src/index.ts`. Todos usan `SupabaseClient<Database>`.

## workoutRepository

```ts
getWorkoutByDate(date)         // YYYY-MM-DD → Workout | null
getWorkouts(limit?)            // historial reciente
createWorkout(data, userId)
updateWorkout(id, data)        // end_time, comment, etc.
deleteWorkout(id)
getWorkoutExercises(workoutId)
addExercise(data, userId)      // → devuelve workout_exercise con ID real de DB
removeExercise(id)             // por workout_exercise.id
reorderExercises(updates)
getSets(workoutExerciseId)
createSet(data, userId)        // → devuelve set con ID real de DB
updateSet(id, data)
deleteSet(id)
```

## exerciseRepository

```ts
getCategories()
createCategory(data, userId)
getExercises(categoryId?)
createExercise(data, userId)
updateExercise(id, data)
deleteExercise(id)
toggleFavorite(id, isFavorite)
```

## routineRepository

```ts
getRoutines()
createRoutine(data, userId)
deleteRoutine(id)
copyRoutine(sourceId, newName, userId)   // deep copy días + ejercicios + predefined sets
getDays(routineId)
createDay(data, userId)
getDayExercises(dayId)
addExercise(data, userId)
removeExercise(id)
getPredefinedSets(rdExerciseId)
savePredefinedSets(rdExerciseId, sets, userId)
```

## progressRepository

```ts
getPersonalRecords(exerciseId)
getAllPersonalRecords()
getChartData(exerciseId)  // → ChartPoint[] { date, maxWeight, totalVolume, maxReps }
```

## bodyTrackerRepository

```ts
getMeasurements()
createMeasurement(data, userId)
updateMeasurement(id, data)
deleteMeasurement(id)
getEntries(measurementId, limit?)
getAllEntries(userId)
addEntry(data, userId)
deleteEntry(id)
```

## calendarRepository

```ts
getWorkoutsForMonth(year, month)   // rango YYYY-MM-01 → último día
getWorkoutSummary(date)            // con workout_exercises + exercises join
getWorkoutHistory(limit?)          // desc por fecha
```
