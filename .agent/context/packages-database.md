# packages/database — @fitnotes/database

_Last updated: 2026-06-22_

## Cliente Supabase (`src/supabase/client.ts`)

```ts
createBrowserClient()              // cliente componente/browser — lee NEXT_PUBLIC_*
createServerClient(cookieStore)    // Server Components / Route Handlers
```

`types.ts` generado con `supabase gen types typescript --project-id fbhjiwtriqrxibqwsyqj`

## Repositorios (`src/repositories/`)

| Repositorio | Métodos clave |
|---|---|
| `workoutRepository` | `getWorkoutByDate`, `createWorkout`, `updateWorkout`, `deleteWorkout`, `getWorkoutExercises`, `addExercise`, `removeExercise`, `getSets`, `createSet`, `updateSet`, `deleteSet`, `getWorkouts` |
| `exerciseRepository` | `getCategories`, `getExercises`, `createExercise`, `updateExercise`, `deleteExercise`, `createCategory`, `toggleFavorite` |
| `routineRepository` | `getRoutines`, `createRoutine`, `deleteRoutine`, `getRoutineDays`, `createDay`, `addExercise`, `getPredefinedSets`, `createPredefinedSet` |
| `progressRepository` | `getPersonalRecords`, `getExerciseHistory` |
| `bodyTrackerRepository` | `getMeasurements`, `createMeasurement`, `getEntries`, `createEntry`, `deleteEntry`, `getAllEntries` |
| `calendarRepository` | `getWorkoutsByMonth` |

## Migraciones (`src/supabase/migrations/`)

- `001_initial_schema.sql` — tablas, RLS, triggers (updated_at + personal_records)
- `002_delete_user_fn.sql` — función RPC `delete_user()` SECURITY DEFINER

## SyncEngine (`src/sync/syncEngine.ts`)

```ts
class SyncEngine {
  sync(lastSyncAt?: string): Promise<{ pushed: number, pulled: number }>
  getPendingCount(): number
}
```

- Mobile usa singleton: `lib/sync.ts` → `export const syncEngine = new SyncEngine(supabase)`
- Pull actualiza workout de hoy via `refetchSignal` en SyncContext
- Pull **no** actualiza stores de ejercicios/rutinas
