# packages/database — @fitnotes/database

_Last updated: 2026-06-23_

## Cliente Supabase (`src/supabase/client.ts`)

```ts
createBrowserClient()              // cliente componente/browser — lee NEXT_PUBLIC_*
createServerClient(cookieStore)    // Server Components / Route Handlers
```

`types.ts` generado con `supabase gen types typescript --project-id fbhjiwtriqrxibqwsyqj`

## Repositorios (`src/repositories/`)

| Repositorio | Métodos destacados |
|---|---|
| `workoutRepository` | getWorkoutByDate, createWorkout, addExercise, getSets, createSet, updateSet, deleteSet |
| `exerciseRepository` | getCategories, getExercises, createExercise, toggleFavorite |
| `routineRepository` | copyRoutine (deep), updateRoutine, updateDayExercise, reorderDays, reorderExercises, savePredefinedSets |
| `progressRepository` | getAllPersonalRecords, getChartData |
| `bodyTrackerRepository` | getMeasurements, addEntry, deleteEntry, getAllEntries |
| `calendarRepository` | getWorkoutsForMonth, getWorkoutSummary |

## Migraciones (`src/supabase/migrations/`)

- `001_initial_schema.sql` — tablas, RLS, triggers (updated_at + personal_records)
- `002_delete_user_fn.sql` — función RPC `delete_user()` SECURITY DEFINER

## SyncEngine (`src/sync/syncEngine.ts`)

```ts
sync(lastSyncAt?): Promise<{ pushed: number, pulled: number }>
getPendingCount(): number
```

- Mobile singleton: `lib/sync.ts` → `export const syncEngine = new SyncEngine(supabase)`
- Pull solo actualiza workout de hoy via `refetchSignal` — NO actualiza stores de ejercicios/rutinas
