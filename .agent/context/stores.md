# Stores — @fitnotes/core

_Last updated: 2026-07-03_

Zustand 5 + Immer. Importados via `@fitnotes/core`. Estado en memoria — **web**: Supabase es la fuente de verdad. **Mobile**: SQLite local es la fuente de verdad (los stores reflejan lo que hay en local, no Supabase directamente); Supabase solo se alcanza vía el `SyncEngine` en background. Ver `offline-sync.md`.

## useWorkoutStore

```ts
// State
activeWorkout: Workout | null
exercises: WorkoutExercise[]       // del workout activo
sets: Record<string, Set[]>        // keyed by workoutExerciseId
workouts: Workout[]                // historial
isLoading: boolean

// Actions clave
startWorkout(date)
loadWorkout(workout, exercises, sets)        // reemplaza estado desde DB
loadWorkouts(workouts)
addExerciseToWorkout(exerciseId, weId?)      // weId = UUID real de DB (crítico)
removeExerciseFromWorkout(workoutExerciseId)
removeWorkoutFromHistory(workoutId)
createSet / updateSet / deleteSet / markSetComplete
finishWorkout()
```

## useExerciseStore

```ts
// State
categories: Category[]
exercises: Exercise[]
isLoading: boolean

// Actions
loadExercises(categories, exercises)
addExercise / updateExercise / deleteExercise
toggleFavorite(id)
addCategory(category)
```

## useProgressStore

```ts
// State
personalRecords: Record<exerciseId, PersonalRecord[]>

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
isLoading: boolean

// Actions
loadRoutines / createRoutine / updateRoutine / deleteRoutine
loadRoutineDays / addRoutineDay / deleteRoutineDay
reorderDays(routineId, updates)              // optimistic update en UI
loadRoutineDayExercises(dayId, exercises)   // reemplaza ejercicios de un día (usado por supersets)
addExerciseToDay / removeExerciseFromDay
reorderExercisesInDay(dayId, updates)
loadPredefinedSets / savePredefinedSets
```

**Nota:** `logRoutineWorkout()` está implementado directamente en `routines/[id].tsx`, no en el store.

## useBodyTrackerStore

```ts
// State
measurements: BodyMeasurement[]
latestEntries: Record<measurementId, BodyMeasurementEntry>
chartData: Record<measurementId, BodyMeasurementEntry[]>
isLoading: boolean

// Actions
loadMeasurements(measurements)
addMeasurement / updateMeasurement / deleteMeasurement
setLatestEntry(entry)
loadChartData(measurementId, entries)
addEntry / deleteEntry
```

## usePreferencesStore

```ts
// State
preferences: UserPreferences   // 16 claves (tema, unidades, toggles, timer, calendario) — ver DEFAULT_PREFERENCES
loaded: boolean

// Actions
loadPreferences(partial)   // Object.assign — merge, no reemplaza (hidratación local + remota conviven)
setPreference(key, value)
```
Hidratado desde `preferencesRepo` (mobile, tabla local `user_preferences`) y opcionalmente fusionado con `user_metadata` si hay sesión real — ver "Preferencias offline" en `offline-sync.md`.

## Fuera de core: useThemeModeStore (mobile)
`apps/mobile/lib/theme.ts` — store zustand simple (`mode: "light"|"dark"|"system"`) NO en `@fitnotes/core` porque solo aplica a mobile. Se hidrata desde `usePreferencesStore.preferences.theme_preference`, no directamente de `user_metadata`. Ver `apps-mobile.md`.
