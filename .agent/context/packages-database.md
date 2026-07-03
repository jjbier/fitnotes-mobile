# packages/database — @fitnotes/database

_Last updated: 2026-07-03_

**Nota:** este paquete ahora tiene dos mitades. `src/repositories/` + `src/supabase/` (cliente/tipos/migraciones remotas, usado por web y por el `SyncEngine`) y `src/local/` + `src/sync/` (repos SQLite locales + motor de sync, usado SOLO por mobile). Detalle completo de la mitad offline en `.agent/context/offline-sync.md` — este archivo se centra en la mitad remota/histórica.

## Cliente Supabase (`src/supabase/client.ts`)

```ts
createBrowserClient()              // cliente componente/browser — lee NEXT_PUBLIC_*
createServerClient(cookieStore)    // Server Components / Route Handlers
```

`types.ts` generado con `supabase gen types typescript --project-id fbhjiwtriqrxibqwsyqj`

## Repositorios (`src/repositories/`)

| Repositorio | Métodos destacados |
|---|---|
| `workoutRepository` | getWorkoutByDate, createWorkout, addExercise(+group_id+group_name), getSets, createSet, updateSet, deleteSet, exportAllCSV, **deleteWorkoutHistory(userId, {dateFrom, dateTo, exerciseId})** |
| `exerciseRepository` | getCategories, getExercises, createExercise, toggleFavorite |
| `routineRepository` | copyRoutine (deep), updateRoutine, updateDayExercise, **updateDayGroupName**, reorderDays, reorderExercises, savePredefinedSets |
| `progressRepository` | getAllPersonalRecords, getChartData (`ChartPoint` con totalReps/totalDistance/totalTime/maxSpeed/bestPace/weightByReps) |
| `bodyTrackerRepository` | getMeasurements, addEntry, deleteEntry, getAllEntries, **exportAllCSV**, **reorderMeasurements**, **seedDefaultMeasurementsIfNeeded**, resetMeasurement |
| `calendarRepository` | getWorkoutsForMonth, getWorkoutSummary, **getWorkoutHistoryDetailed**, **getWorkoutSetDetail**, **getWorkoutDatesForExerciseWithConditions** |
| `goalsRepository` | getGoals, createGoal, updateGoal, deleteGoal, markAchieved |
| **`backupRepository`** (nuevo) | `exportBackup(userId)`, `restoreBackup(userId, data, onStep?)`, `recalculatePersonalRecords(userId)`, `isBackupData(v)`. Usado por mobile (web tiene su propia versión inline en `settings/page.tsx`) |

**Nota:** `ChartPoint` está duplicado en `packages/core/src/stores/progressStore.ts` — mantener ambas definiciones sincronizadas al añadir campos.

## Migraciones aplicadas en Supabase (`src/supabase/migrations/`)

- `001_initial_schema.sql` — tablas base, RLS, triggers (updated_at + personal_records)
- `002_delete_user_fn.sql` — función RPC `delete_user()` SECURITY DEFINER
- `003_exercise_config_and_group_name.sql` — `exercises.weight_increment`, `default_rest_seconds`; `routine_day_exercises.group_id`; `workout_exercises.group_id`, `group_name`
- `004_default_chart.sql` — `exercises.default_chart TEXT` ("weight"|"volume"|"reps")
- `005_routine_day_exercise_group_name.sql` — `routine_day_exercises.group_name TEXT`
- `006_body_measurement_order.sql` — `body_measurements.order_index INTEGER` (reorden drag&drop)
- `007_offline_sync_prep.sql` — documenta drift real del schema (`is_warmup` en sets, `exercise_goals`) que ya existía en `types.ts` pero no en ninguna migración committeada; necesario antes de escribir el schema SQLite local contra el esquema real

**Tabla `exercise_goals`** existe en DB (goals por ejercicio) — presente en `types.ts`, gestionada por `goalsRepository`.

## Repos locales SQLite (`src/local/repositories/`) — solo mobile

`localWorkoutRepository`, `localExerciseRepository`, `localRoutineRepository` — espejan 1:1 los repos remotos de arriba (mismo nombre de método, mismo shape `{data, error}`), pero leen/escriben SQLite vía la interfaz `SqlExecutor` en vez de Supabase. Body tracker y goals (Fase 5) y personal records offline (Fase 6) siguen pendientes. Detalle completo (esquema, cascadas FK a replicar a mano, patrón de escritura, DI): **`.agent/context/offline-sync.md`**.

## SyncEngine (`src/sync/syncEngine.ts`) — v2, offline-first

```ts
class SyncEngine {
  constructor(client: SupabaseClient<Database>, db: SqlExecutor)
  async sync(userId): Promise<{ pushed, pullFailed, pushFailed, changedTables: Set<string> }>
  async getPendingCount(): Promise<number>
}
```
Reescrito en la Fase 3 del plan offline — el motor viejo (`pullRemoteChanges` solo contaba filas, `queueOperation()` nunca se llamaba) fue reemplazado por pull real (`pullChanges.ts`, paginado por `updated_at`), cola durable en SQLite (`pendingOpsQueue.ts`, reemplaza el JSON en memoria de antes) y orden de push que respeta FKs (`pushOrdering.ts`). Conflicto: local gana si `_dirty`, si no gana `updated_at` más reciente (`applyRemoteRows.ts`).

- Mobile singleton: `apps/mobile/lib/sync.ts` → `getSyncEngine()`
- Triggers: `AppState` foreground **y** reconexión de red (`netinfo.ts`) en `_layout.tsx`
- `_layout.tsx` usa `changedTables` para releer desde **local** (ya no vuelve a pedir a Supabase):
  - `exercises` o `categories` → lee `createLocalExerciseRepository(db).getCategories()/getExercises()` → `loadExercises(...)` en store
  - `routines`/`routine_days`/`routine_day_exercises` → `createLocalRoutineRepository(db).getRoutines()` → `loadRoutines(...)` en store
  - `workouts`/`workout_exercises`/`sets` → `setRefetchSignal(n + 1)` (las pantallas releen su propio repo local)

## exercise_type enum en DB
Valores UPPERCASE: `WEIGHT_REPS`, `REPS_ONLY`, `DISTANCE_TIME`, `WEIGHT_ONLY`, `TIME_ONLY`
Al insertar ejercicios desde fuera de la app, usar siempre UPPERCASE.

## Applying migrations (sin CLI instalado)

Usar Management API con PAT (guardado en memory):
```bash
curl -X POST "https://api.supabase.com/v1/projects/fbhjiwtriqrxibqwsyqj/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE ..."}'
```
