# packages/database — @fitnotes/database

_Last updated: 2026-06-28_

## Cliente Supabase (`src/supabase/client.ts`)

```ts
createBrowserClient()              // cliente componente/browser — lee NEXT_PUBLIC_*
createServerClient(cookieStore)    // Server Components / Route Handlers
```

`types.ts` generado con `supabase gen types typescript --project-id fbhjiwtriqrxibqwsyqj`

## Repositorios (`src/repositories/`)

| Repositorio | Métodos destacados |
|---|---|
| `workoutRepository` | getWorkoutByDate, createWorkout, addExercise(+group_id+group_name), getSets, createSet, updateSet, deleteSet |
| `exerciseRepository` | getCategories, getExercises, createExercise, toggleFavorite |
| `routineRepository` | copyRoutine (deep), updateRoutine, updateDayExercise, **updateDayGroupName**, reorderDays, reorderExercises, savePredefinedSets |
| `progressRepository` | getAllPersonalRecords, getChartData |
| `bodyTrackerRepository` | getMeasurements, addEntry, deleteEntry, getAllEntries |
| `calendarRepository` | getWorkoutsForMonth, getWorkoutSummary |
| `goalsRepository` | getGoals, createGoal, updateGoal, deleteGoal, markAchieved |

## Migraciones aplicadas en Supabase (`src/supabase/migrations/`)

- `001_initial_schema.sql` — tablas base, RLS, triggers (updated_at + personal_records)
- `002_delete_user_fn.sql` — función RPC `delete_user()` SECURITY DEFINER
- `003_exercise_config_and_group_name.sql` — `exercises.weight_increment`, `default_rest_seconds`; `routine_day_exercises.group_id`; `workout_exercises.group_id`, `group_name`
- `004_default_chart.sql` — `exercises.default_chart TEXT` ("weight"|"volume"|"reps")
- `005_routine_day_exercise_group_name.sql` — `routine_day_exercises.group_name TEXT`

## SyncEngine (`src/sync/syncEngine.ts`)

```ts
sync(lastSyncAt?): Promise<{ pushed: number, pulled: number }>
getPendingCount(): number
```

- Mobile singleton: `lib/sync.ts` → `export const syncEngine = new SyncEngine(supabase)`
- Pull solo actualiza workout de hoy via `refetchSignal` — **NO actualiza stores de ejercicios/rutinas**

## Applying migrations (sin CLI instalado)

Usar Management API con PAT (guardado en memory):
```bash
curl -X POST "https://api.supabase.com/v1/projects/fbhjiwtriqrxibqwsyqj/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE ..."}'
```
