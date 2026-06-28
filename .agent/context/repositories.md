# Repositories — @fitnotes/database

_Last updated: 2026-06-28_

Todos exportados desde `packages/database/src/index.ts`. Todos usan `SupabaseClient<Database>`.

## workoutRepository

```ts
getWorkoutByDate(date)         // YYYY-MM-DD → Workout | null
getWorkouts(limit?)            // historial reciente
createWorkout(data, userId)
updateWorkout(id, data)
deleteWorkout(id)
getWorkoutExercises(workoutId)
addExercise(data, userId)      // data: { workout_id, exercise_id, order_index, group_id?, group_name? }
removeExercise(id)
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
updateCategory(id, data)
deleteCategory(id)
getExercises(categoryId?)
createExercise(data, userId)
updateExercise(id, data)       // incluye weight_increment, default_rest_seconds, default_chart
deleteExercise(id)
toggleFavorite(id, isFavorite)
```

## routineRepository

```ts
getRoutines()
createRoutine(data, userId)
updateRoutine(id, data)
deleteRoutine(id)
copyRoutine(sourceId, newName, userId)           // deep copy: días + ejercicios + predefined sets
getDays(routineId)
createDay(data, userId)
updateDay(id, data)
deleteDay(id)
reorderDays(updates)                             // [{ id, order_index }]
getDayExercises(dayId)
addExercise(data, userId)
updateDayExercise(id, data)                      // { group_id?: string|null, group_name?: string|null }
updateDayGroupName(groupId, name)                // actualiza group_name en TODOS los miembros del grupo
removeExercise(id)
reorderExercises(updates)
getPredefinedSets(routineDayExerciseId)
savePredefinedSets(rdExerciseId, sets, userId)   // delete+insert — reemplaza completo
getRoutineStats(routineIds)                      // { lastUsed, sessionCount } por rutina
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

## goalsRepository

```ts
getGoals(exerciseId?)
createGoal(data, userId)
updateGoal(id, data)
deleteGoal(id)
markAchieved(id, achievedAt)
```
