# Repositories — @fitnotes/database

All exported from `packages/database/src/index.ts`.
All use `SupabaseClient<Database>` as client type.

## exerciseRepository
```ts
getCategories()
getCategory(id)
createCategory(data, userId)
updateCategory(id, data)
deleteCategory(id)
getExercises(categoryId?)
getExercise(id)
createExercise(data, userId)
updateExercise(id, data)
deleteExercise(id)
toggleFavorite(id, isFavorite)
searchExercises(query)
```

## routineRepository
```ts
getRoutines()
createRoutine(data, userId)
updateRoutine(id, data)
deleteRoutine(id)
copyRoutine(sourceId, newName, userId)   // deep copy days + exercises + predefined sets
getDays(routineId)
createDay(data, userId)
updateDay(id, data)
deleteDay(id)
getDayExercises(dayId)
addExercise(data, userId)
removeExercise(id)
reorderExercises(updates: {id, order_index}[])
getPredefinedSets(rdExerciseId)
savePredefinedSets(rdExerciseId, sets, userId)
```

## workoutRepository
```ts
getWorkoutByDate(date)         // returns single or null
getWorkouts(limit?)
createWorkout(data, userId)
updateWorkout(id, data)
deleteWorkout(id)
getWorkoutExercises(workoutId)
addExercise(data, userId)
removeExercise(id)
reorderExercises(updates)
getSets(workoutExerciseId)
createSet(data, userId)
updateSet(id, data)
deleteSet(id)
shareWorkout(workoutId)        // returns plain text string for sharing
```

## progressRepository
```ts
getPersonalRecords(exerciseId)
getAllPersonalRecords()
getChartData(exerciseId): Promise<ChartPoint[]>
// ChartPoint: { date, maxWeight, totalVolume, maxReps }
// getChartData: fetches workout_exercises + sets, aggregates by date in JS
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
resetMeasurement(measurementId)   // deletes all entries for a measurement
```

## calendarRepository
```ts
getWorkoutsForMonth(year, month)   // date range YYYY-MM-01 → last day
getWorkoutSummary(date)            // with workout_exercises + exercises join
getWorkoutHistory(limit?)          // sorted desc by date
```
