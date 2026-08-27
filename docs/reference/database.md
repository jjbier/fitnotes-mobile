# Referencia — `packages/database`

_Generado a partir de la documentación TSDoc añadida al código fuente (2026-07-16). Dos mitades: `repositories/`+`supabase/` (remoto, usado por web y por el `SyncEngine`) y `local/`+`sync/` (SQLite local + motor de sync, solo mobile)._

## Mitad remota — `src/repositories/` + `src/supabase/`

| Archivo | Fábrica | Responsabilidad |
|---|---|---|
| `backupRepository.ts` | `createBackupRepository` | `exportBackup`/`restoreBackup`/`recalculatePersonalRecords`. `BackupData` (interface) es el volcado completo de las 12+1 tablas del usuario. `isBackupData` — type guard mínimo del JSON de backup |
| `bodyTrackerRepository.ts` | `createBodyTrackerRepository` | CRUD de `body_measurements`/`body_measurement_entries`, seed de medidas por defecto, `exportAllCSV` |
| `calendarRepository.ts` | `createCalendarRepository` | Consultas orientadas a calendario/historial con joins anidados (entrenamientos por mes/fecha, colores/categorías, filtros por condición de set) |
| `exerciseRepository.ts` | `createExerciseRepository` | CRUD de categorías/ejercicios + analíticas fuera de alcance offline: `getExerciseHistory`, `convertExerciseWeights`, `getExerciseStats`. `CategoryDomain`/`ExerciseDomain` — filas mapeadas al dominio |
| `goalsRepository.ts` | `createGoalsRepository` | `getGoals`/`upsertGoal`/`deleteGoal`/`markAchieved` sobre `exercise_goals` (casts `as never` — tabla fuera de los tipos generados). `ExerciseGoalRow` — objetivo con `achieved_at` |
| `progressRepository.ts` | `createProgressRepository` | `getPersonalRecords`, `getChartData` (agregación en memoria: fórmula de 1RM, velocidad/ritmo), `getWeeklyTraining`. `ChartPoint` (interface) — debe mantenerse sincronizada con la homónima de `packages/core` |
| `routineRepository.ts` | `createRoutineRepository` | CRUD completo de rutinas en jerarquía de 4 niveles (rutina/día/ejercicio/set predefinido), incl. `copyRoutine` (clonado secuencial) y `getRoutineStats` |
| `workoutRepository.ts` | `createWorkoutRepository` | El repositorio remoto más grande: CRUD de workouts/workout_exercises/sets, `copyWorkout`, `shareWorkout`, `importFromCSV`/`exportAllCSV`, `deleteWorkoutHistory` con filtros |
| `supabase/client.ts` | `createBrowserClient` / `createServerClient` | Fábricas de clientes Supabase tipados para componentes cliente y Server Components/Route Handlers (vía callbacks de cookies) |

**Alcance en mobile**: estos repos remotos los usa mobile SOLO para métodos analíticos fuera de alcance offline (`getExerciseStats`, `getExerciseHistory`, `convertExerciseWeights`, `getRoutineStats`, `getChartData`, backup/CSV) — el resto del CRUD usa los repos locales de abajo.

## Motor de sincronización — `src/sync/` (solo mobile)

| Archivo | Export | Responsabilidad |
|---|---|---|
| `syncEngine.ts` | `SyncEngine` (class) | `getStatus`/`getPendingCount`/`pushLocalChanges`/`pullRemoteChanges`/`sync` — orquesta push (con reintento/backoff) y pull (incremental con watermarks). `SyncStatus` = `"idle"\|"syncing"\|"error"`. `SyncResult` — resultado agregado de un ciclo completo |
| `pushOrdering.ts` | `PUSH_ORDER`, `sortPendingOpsForPush` | Orden padres-antes-que-hijos (insert/update) e hijos-antes-que-padres (delete) respetando FKs |
| `pullChanges.ts` | `pullTableChanges` | Trae todas las filas de una tabla para un usuario posteriores a una marca de agua, paginado |
| `applyRemoteRows.ts` | `applyRemoteRows` | Upsert de filas remotas a SQLite local; conflicto: **gana lo local si `_dirty`**, si no gana el `updated_at` más reciente |
| `pendingOpsQueue.ts` | `getDueOps`, `getPendingCount`, `markOpSucceeded`, `markOpFailed`, `hasPendingOpsForRow` | Cola durable de operaciones pendientes con backoff exponencial (`next_retry_at`) |
| `watermarks.ts` | `getWatermark`, `setWatermark` | Marca de agua de sincronización por tabla, para pulls incrementales |
| `claimGuestData.ts` | `claimGuestIdentity` | Reescribe `user_id` de invitado a cuenta real en las 13 tablas + `pending_ops` ya encolados, en una única transacción |

## Capa local SQLite — `src/local/` (solo mobile)

### Infraestructura

| Archivo | Export | Responsabilidad |
|---|---|---|
| `schema.ts` | `LOCAL_SCHEMA_STATEMENTS`, `SYNCABLE_TABLES`, `SyncableTable` (type) | DDL de las 13 tablas locales; `SYNCABLE_TABLES` son las tablas de datos de fitness que pasan por el `SyncEngine` (excluye metadato de dispositivo) |
| `migrations.ts` | `runLocalMigrations` | Ejecuta migraciones pendientes según `PRAGMA user_version`, cada una en su propia transacción |
| `sqlExecutor.ts` | `SqlExecutor` (interface), `SqlRunResult` (interface) | Abstracción inyectada sobre una conexión SQL local (permite testear con `better-sqlite3` sin `expo-sqlite`) |
| `serializeExecutor.ts` | `serializeExecutor` | Serializa llamadas concurrentes a un `SqlExecutor` para evitar transacciones solapadas |
| `pendingOpsSchema.ts` / `pendingOps.ts` | `PENDING_OPS_SCHEMA_STATEMENTS`, `PendingOpType` (type), `enqueuePendingOp` | Tabla y helper de cola de operaciones a subir; se llama dentro de la misma transacción que la escritura local |
| `watermarksSchema.ts` | `WATERMARKS_SCHEMA_STATEMENTS` | DDL de `sync_watermarks` |
| `localIdentitySchema.ts` / `localIdentity.ts` | `LocalIdentity` (interface), `getOrCreateLocalIdentity`, `setActiveIdentity` | Tabla singleton `local_identity`: resuelve el `userId` de escritura siempre presente (invitado o cuenta real) |
| `localPreferencesSchema.ts` | `LOCAL_PREFERENCES_SCHEMA_STATEMENTS` | DDL de `user_preferences` (clave/valor, fuera de `SYNCABLE_TABLES`) |
| `repositories/shared.ts` | `nowIso`, `toBool`, `fromBool`, `RawRow` (interface), `RepoError` (interface) | Helpers comunes: timestamp ISO, conversión booleano↔INTEGER SQLite, forma de fila cruda, forma de error que espeja `PostgrestError` sin acoplarse a Supabase |

### Repositorios locales (`local/repositories/`) — espejan 1:1 los remotos

| Archivo | Fábrica | Notas relevantes |
|---|---|---|
| `localWorkoutRepository.ts` | `createLocalWorkoutRepository` | `deleteWorkout`/`removeExercise` con cascada manual (`workout_exercises`→`sets`); `updateSet` genera `personal_records` (réplica JS del trigger SQL, posible duplicado tras sync); `copyWorkout` es fire-and-forget sin shape `{data,error}`; `getWorkoutsWithSummary`/`getLastSessionSets`/`getLastWorkoutByExercises` son agregaciones JS de solo lectura |
| `localExerciseRepository.ts` | `createLocalExerciseRepository` | `deleteCategory` = `SET NULL` manual sobre `exercises` (bug histórico corregido); `deleteExercise` = cascada manual sobre `workout_exercises`→`sets` y `routine_day_exercises`→`predefined_sets` (bug histórico corregido) |
| `localRoutineRepository.ts` | `createLocalRoutineRepository` | `deleteRoutine`/`deleteDay` = cascada manual multinivel; `copyRoutine` = clonado profundo con IDs nuevos; `savePredefinedSets` = reemplazo total (tombstone+insert), no diff |
| `localBodyTrackerRepository.ts` | `createLocalBodyTrackerRepository` | `deleteMeasurement` = cascada manual sobre `body_measurement_entries`; `resetMeasurement` vacía histórico sin borrar la medida; `seedDefaultMeasurementsIfNeeded` = bootstrap |
| `localGoalsRepository.ts` | `createLocalGoalsRepository` | CRUD + `markAchieved` sobre `exercise_goals`, semántica de upsert/tombstone/pending_ops |
| `localProgressRepository.ts` | `createLocalProgressRepository` | Solo lectura: `getPersonalRecords`/`getAllPersonalRecords`/`getWeeklyTraining`/`getBestSetsByExercise`, agregaciones en JS sobre tablas ya replicadas |
| `localPreferencesRepository.ts` | `createLocalPreferencesRepository` | `getAll`/`set`/`setMany` — **no** encola `pending_ops` (tabla fuera de sync) |

**Cascadas manuales** — SQLite corre sin `PRAGMA foreign_keys` a propósito; cada FK `ON DELETE CASCADE`/`SET NULL` remota se replica a mano en el `deleteXxx` local correspondiente (ver tabla arriba). Al añadir un `deleteXxx` nuevo, verificar la FK real en `supabase/migrations/001_initial_schema.sql` antes de asumir comportamiento.

## Testing
`testing/nodeSqlExecutor.ts` (better-sqlite3) + `runLocalMigrations(db)` → DB en memoria fresca por test. 87 tests en `packages/database` (16 archivos): repos locales, identidad, claim, migraciones, `serializeExecutor`, sync (`applyRemoteRows`/`pendingOpsQueue`/`pushOrdering`/`syncEngine`).
