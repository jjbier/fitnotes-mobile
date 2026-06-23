# Repositories — @fitnotes/database

_Last updated: 2026-06-23_

Todos exportados desde `packages/database/src/index.ts`. Todos usan `SupabaseClient<Database>`.

## workoutRepository

```ts
getWorkoutByDate(date)         // YYYY-MM-DD → Workout | null
getWorkouts(limit?)            // historial reciente
createWorkout(data, userId)
updateWorkout(id, data)
deleteWorkout(id)
getWorkoutExercises(workoutId)
addExercise(data, userId)      // → devuelve workout_exercise con UUID real
removeExercise(id)             // por workout_exercise.id
reorderExercises(updates)
getSets(workoutExerciseId)
createSet(data, userId)
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
updateRoutine(id, data)                          // editar nombre/notas
deleteRoutine(id)
copyRoutine(sourceId, newName, userId)           // deep copy: días + ejercicios + predefined sets
getDays(routineId)
createDay(data, userId)
updateDay(id, data)
deleteDay(id)
reorderDays(updates)                             // [{ id, order_index }]
getDayExercises(dayId)
addExercise(data, userId)
updateDayExercise(id, data)                      // { group_id?: string | null } — supersets
removeExercise(id)
reorderExercises(updates)                        // [{ id, order_index }]
getPredefinedSets(routineDayExerciseId)
savePredefinedSets(rdExerciseId, sets, userId)   // delete+insert — reemplaza completo
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
getWorkoutsForMonth(year, month)
getWorkoutSummary(date)
getWorkoutHistory(limit?)
```
