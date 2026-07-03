# Offline sync — apps/mobile

_Last updated: 2026-07-03_

Plan completo en `/home/xabier/.claude/plans/precious-snuggling-shannon.md` (6 fases — la 7 original, bootstrap, se fusionó en la 5). Objetivo: CRUD completo sin red en mobile (workouts, ejercicios/categorías, rutinas, body tracker, goals, personal records, preferencias), con **cuenta opcional** — la app funciona desde el primer arranque sin login, y crear/vincular una cuenta activa la sincronización. **Solo mobile** — web no cambia y sigue requiriendo cuenta.

## Estado por fase — todas ✅
| Fase | Contenido |
|---|---|
| 0 | De-risk `expo-sqlite` en el proyecto nativo a mano |
| 1 | UUIDs reales, `SqlExecutor`, esquema local (13 tablas), migraciones, DI |
| 2 | Workouts/workout_exercises/sets offline |
| 3 | Motor de sync real (push/pull, cola durable, conflictos) |
| 4 | Ejercicios/categorías/rutinas offline |
| 5 | Cuenta opcional: identidad invitado, claim, bootstrap (sin módulo aparte), body tracker/goals offline, gating remote-only |
| 6 | Personal records offline (réplica JS del trigger SQL) + lectura local de PRs/progreso semanal/mejores series |
| post-6 | Preferencias offline (fallback local a `user_metadata`) |

## Cuenta opcional — identidad invitado y claim (Fase 5)

- **`local_identity`** (tabla singleton, `localIdentitySchema.ts`+`localIdentity.ts`): `{ active_user_id, is_guest }`. `getOrCreateLocalIdentity(db)` genera un UUID de invitado en el primer arranque; `setActiveIdentity(db, {userId, isGuest})` la actualiza tras un claim o un wipe.
- **`RepositoryContext`** resuelve esta identidad: `useRepositories() → { userId, isGuest, refreshIdentity, wipeAndSetIdentity }`. `userId` **siempre** está resuelto — ninguna pantalla llama a `getSession()` para identidad de escritura local.
- **`_layout.tsx`** ya no fuerza login: arranque en frío → asegurar `local_identity` → navegar siempre a `(tabs)`. Login/registro alcanzables desde Configuración.
- **Claim** (`sync/claimGuestData.ts` → `claimGuestIdentity(db, {guestUserId, realUserId})`): en una transacción, `UPDATE <tabla> SET user_id = realUserId WHERE user_id = guestUserId` en las 13 tablas + reescribe `user_id` en los payloads JSON de `pending_ops` ya encolados. Se dispara en `onAuthStateChange` cuando `session.user.id !== local_identity.active_user_id` y `is_guest = true`.
- **Sin módulo de bootstrap aparte**: `pullTableChanges` ya hace pull completo paginado cuando el watermark es `null` — el `sync()` normal tras el claim trae todo el histórico. Push-antes-que-pull es seguro: las filas reclamadas quedan `_dirty=1` hasta pushearse, y `applyRemoteRows` nunca pisa una fila `_dirty`.
- **`wipeAndSetIdentity`** (en `RepositoryContext`): `resetLocalDb()` (cierra+borra+reabre `expo-sqlite`) → crea identidad → opcionalmente la fija a cuenta real. Usado en sign-out y en cambio directo entre dos cuentas reales.
- **Guard crítico de seguridad**: `handleSessionChange(session, isExplicitSignOut)` en `_layout.tsx` solo vacía la DB si `isExplicitSignOut` (evento `SIGNED_OUT` real) — nunca en la comprobación de sesión del arranque en frío. Sin esto, el bug de sesión-no-sobrevive-a-force-stop (abajo) borraría datos de una cuenta real en vez de solo fallar el sync en silencio.
- **`SyncEngine` no corre en modo invitado**: `runSync()` retorna temprano si `isGuest === true` — RLS/FK de Supabase rechazarían filas de invitado.
- **Gating remote-only**: backup/CSV, recalcular PRs, restaurar, eliminar historial, estadísticas avanzadas — `settings.tsx` usa `requireAccount()` antes de cada una.
- **Limitación aceptada**: mismo usuario invitado en dos dispositivos antes de crear cuenta → ambos claims generan filas duplicadas al vincularse a la misma cuenta (sin dedup).

## Preferencias offline (post-Fase 6)

Antes, tema/unidades/toggles vivían solo en `user_metadata` — sin cuenta, `updateUser()` no tenía dónde persistir y todo se degradaba a los valores por defecto en cada arranque. Fallback local:

- **`UserPreferences`** (`packages/core/src/types/preferences.ts`): 16 claves (`theme_preference`, `display_name`, `weight_unit`, `default_weight_increment`, `calendar_week_start`, `auto_select_next_set`, `track_personal_records`, `mark_sets_complete`, `default_rest_seconds`, `rest_timer_sound_enabled`, `rest_timer_volume`, `estimated_records_rep_limit`, `show_set_count_home`, `hidden_category_ids`, `calendar_show_day_panel`, `calendar_show_category_dots`) + `DEFAULT_PREFERENCES`.
- **`usePreferencesStore`** (zustand+immer, mismo patrón que el resto de core): `{ preferences, loaded, loadPreferences(partial), setPreference(key, value) }`.
- **`createLocalPreferencesRepository`**: tabla `user_preferences` clave/valor (`key TEXT PRIMARY KEY, value TEXT` JSON), migración v3. **No** está en `SYNCABLE_TABLES` ni lleva `_dirty`/`_deleted` — configuración de dispositivo, no datos de fitness; el `SyncEngine` no la toca.
- **Hidratación**: `RepositoryContext` carga `preferencesRepo.getAll()` en `usePreferencesStore` (y sincroniza `useThemeModeStore`) en cada arranque/wipe. Con sesión real, `_layout.tsx`'s `hydratePreferencesFromSession()` fusiona `user_metadata` PISANDO el valor local (remoto gana, refleja otros dispositivos); sin sesión (invitado) no toca nada.
- **Escritura**: cada pantalla llama `preferencesRepo.set(key, value)` (persiste local, siempre) + `usePreferencesStore.setPreference()` (reactivo) + si `!isGuest`, además `supabase.auth.updateUser({data:{[key]:value}})` en segundo plano (mantiene sync entre dispositivos para cuentas reales).
- **Ciclo de vida**: se resetean en un wipe completo (`wipeAndSetIdentity`) — decisión deliberada, evita fuga de preferencias entre cuentas en un dispositivo compartido.
- Pantallas migradas: `settings.tsx`, `calendar.tsx`, `exercises.tsx`, `index.tsx`, `workout/[exerciseId].tsx`, `exercise-history/[exerciseId].tsx`.
- Verificado en dispositivo físico (rebuild forzando bundle): tema oscuro + unidad "lb" persisten en modo invitado tras `force-stop`.

## Personal records offline (Fase 6)

- **`computePersonalRecordUpdate()`** (`packages/core/src/utils/personalRecords.ts`): réplica pura del trigger SQL `update_personal_record` — gate `is_complete && weight != null && reps != null`, nuevo PR si `weight > max actual para (exercise_id, reps)`. **No filtra `is_warmup`**, igual que el trigger (deliberado, evita divergir del histórico ya generado en producción).
- **`maybeRecordPersonalRecord()`** (privada, dentro de `localWorkoutRepository.ts`): corre en la misma transacción que `updateSet` — relee el set, resuelve `exercise_id`/`user_id` vía `workout_exercises`, calcula el máximo local para `(exercise_id, reps, user_id)`, inserta fila nueva en `personal_records` si toca (`_dirty=1` + `enqueuePendingOp`). Solo INSERT, nunca overwrite — histórico acumulativo, igual que el trigger.
- **`createLocalProgressRepository`**: `getPersonalRecords`/`getAllPersonalRecords` (alimentadas por lo anterior) + `getWeeklyTraining`/`getBestSetsByExercise` (JOIN/GROUP BY simples sobre tablas ya locales, migradas también aunque fuera del plan original de la Fase 6 — sin ellas el resumen semanal de Progreso y el auto-check de goals sin PR de peso quedaban rotos en modo invitado). `getExerciseStats`/`getExerciseHistory`/`getRoutineStats`/`getChartData`/`convertExerciseWeights` siguen remote-only.
- Pantallas: `(tabs)/progress.tsx`, `goals/index.tsx`, `calculators.tsx` al `progressRepo` local. `workout/[exerciseId].tsx` usa split-repo: local para el badge de PR, `remoteProgressRepo` solo para `getChartData`.
- **Duplicado esperado, no un bug**: workout offline + claim+sync puede generar dos filas de PR para el mismo evento (PR local ya escrito + trigger SQL remoto al pushear el set) — sin dedup entre ambos mecanismos, aceptado.

## Decisión central
Capa de repos locales en SQLite que espeja 1:1 los repos de Supabase: mismo patrón de fábrica, mismo shape `{data, error}`, mismos nombres de método. SQL crudo (sin ORM). El executor se inyecta como interfaz (`SqlExecutor`) para testear con Vitest usando `better-sqlite3` sin tocar `expo-sqlite`.

La base local es la única fuente de verdad para la UI. Las escrituras van siempre primero a local (instantáneas) y se encolan en `pending_ops` (misma transacción) para el push en background. Los repos remotos los usa el `SyncEngine` y las pantallas para analíticas fuera de alcance offline.

## `packages/database/src/local/` — infraestructura
```
sqlExecutor.ts          interfaz SqlExecutor (execAsync/runAsync/getAllAsync/getFirstAsync/withTransactionAsync)
serializeExecutor.ts    envuelve un SqlExecutor para serializar accesos concurrentes
schema.ts               13 tablas + SYNCABLE_TABLES + índices
migrations.ts           runner versionado vía PRAGMA user_version
pendingOpsSchema.ts     tabla pending_ops (cola durable de escrituras a pushear)
pendingOps.ts           enqueuePendingOp(db, table, rowId, opType, payload), getPendingCount
watermarksSchema.ts     tabla sync_watermarks (marca de agua por tabla para pull incremental)
testing/nodeSqlExecutor.ts   driver Node (better-sqlite3) para Vitest
localIdentitySchema.ts  tabla singleton local_identity (invitado vs. cuenta real)
localIdentity.ts        getOrCreateLocalIdentity(db), setActiveIdentity(db, {userId, isGuest})
localPreferencesSchema.ts  tabla clave/valor user_preferences (no sincronizable)
repositories/           localWorkoutRepository.ts, localExerciseRepository.ts, localRoutineRepository.ts,
                        localBodyTrackerRepository.ts, localGoalsRepository.ts, localProgressRepository.ts,
                        localPreferencesRepository.ts, shared.ts
```
`sync/claimGuestData.ts` — `claimGuestIdentity(db, {guestUserId, realUserId})`.
13 tablas locales = las 13 de `SYNCABLE_TABLES`: categories, exercises, workouts, workout_exercises, sets, personal_records, routines, routine_days, routine_day_exercises, predefined_sets, body_measurements, body_measurement_entries, exercise_goals. Cada una: columnas de negocio + `id TEXT PRIMARY KEY` (UUID) + `user_id`, `updated_at`, `created_at` + `_dirty INTEGER` + `_deleted INTEGER` (tombstone).

## Patrón de escritura en un repo local
```ts
async createExercise(data, userId) {
  const id = generateUUID();               // UUID real desde el inicio, nunca temporal
  const row = { id, user_id: userId, ...data, created_at: ts, updated_at: ts };
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO exercises (...) VALUES (...)`, [...]);
    await enqueuePendingOp(db, "exercises", id, "insert", row);   // misma transacción
  });
  return { data: row, error: null };
}
```
- Deletes: tombstone (`_deleted = 1`), nunca borrado físico — evita que un pull concurrente "resucite" una fila borrada.
- Lecturas: siempre `WHERE _deleted = 0`.
- **Cascadas manuales** (SQLite sin `PRAGMA foreign_keys`, a propósito — ver `architecture.md`): cada FK `ON DELETE CASCADE`/`SET NULL` remota debe replicarse a mano en el `deleteXxx` local. Lista actual:
  - `deleteWorkout` → `workout_exercises` → `sets`
  - `deleteExercise` → `workout_exercises`→`sets` y `routine_day_exercises`→`predefined_sets` (CASCADE)
  - `deleteCategory` → `SET NULL` en `category_id` de sus ejercicios
  - `deleteRoutine`/`deleteDay`/`removeExercise` → cascada día→ejercicios→predefined_sets (CASCADE)
  - `deleteMeasurement` → `body_measurement_entries` (CASCADE)
  - **Al añadir un `deleteXxx` nuevo: revisar la FK real en `supabase/migrations/001_initial_schema.sql` antes de asumir el comportamiento** — SET NULL y CASCADE se ven casi igual si no se verifica.

## Repos locales — alcance (qué se queda en remoto)
| Repo local | Cubre | Fuera de alcance (remoto) |
|---|---|---|
| `localWorkoutRepository` | workouts, workout_exercises, sets — CRUD completo, incl. `personal_records` en `updateSet` | `exportAllCSV`, `shareWorkout`, `deleteWorkoutHistory` |
| `localExerciseRepository` | categorías + ejercicios — CRUD completo | `getExerciseHistory`, `convertExerciseWeights`, `getExerciseStats` |
| `localRoutineRepository` | rutinas, días, ejercicios, predefined sets, `copyRoutine` deep | `getRoutineStats` |
| `localBodyTrackerRepository` | medidas + registros — CRUD, `seedDefaultMeasurementsIfNeeded` | `exportAllCSV` |
| `localGoalsRepository` | goals (`upsertGoal` traduce `onConflict: user_id,exercise_id` a `INSERT ... ON CONFLICT DO UPDATE`) | — |
| `localProgressRepository` | `getPersonalRecords`, `getAllPersonalRecords`, `getWeeklyTraining`, `getBestSetsByExercise` | `getExerciseStats`, `getExerciseHistory`, `getRoutineStats`, `getChartData`, `convertExerciseWeights` |
| `localPreferencesRepository` | 16 claves de `UserPreferences` — fuera de `SYNCABLE_TABLES` | `user_metadata` sigue como sync entre dispositivos para cuentas reales |

Patrón "split-repo" en pantallas que mezclan ambos: `useRepositories()` para el CRUD + `useMemo(() => createExerciseRepository(supabase), [])` (u otro remoto) solo para los métodos fuera de alcance. Ejemplo: `(tabs)/exercises.tsx`, `exercises/[categoryId].tsx`, `(tabs)/tools.tsx`, `exercise-history/[exerciseId].tsx`.

## DI — `RepositoryContext`
- `lib/db/client.ts` → `getLocalDb(): Promise<SqlExecutor>` — abre `expo-sqlite` (singleton `dbPromise`), aplica migraciones, envuelve con `serializeExecutor`. `resetLocalDb()` — cierra+borra+reabre.
- `contexts/RepositoryContext.tsx` → `<RepositoryProvider>` construye los 7 repos locales una vez (`useMemo`) y resuelve `local_identity`: `useRepositories() → { db, workoutRepo, exerciseRepo, routineRepo, bodyTrackerRepo, goalsRepo, progressRepo, preferencesRepo, userId, isGuest, refreshIdentity, wipeAndSetIdentity }`. Gatea el render hasta que `getLocalDb()` y la identidad resuelven; preferencias se hidratan en un efecto aparte (no gatean el render).
- **Regla**: ninguna pantalla instancia `createXxxRepository(supabase)` para CRUD ni llama `getSession()` para un `userId` de escritura — solo `useRepositories()`. Repos remotos solo para métodos "fuera de alcance" o dentro del `SyncEngine`.
- `_layout.tsx` envuelve el árbol con `RepositoryProvider`; la lógica de auth/sync vive en `AppContent` (hijo, puede usar `useRepositories()`). Tras sync no vuelve a pedir datos a Supabase: relee de SQLite vía `createLocalExerciseRepository`/`createLocalRoutineRepository`.

## `SyncEngine` (`packages/database/src/sync/`)
```ts
class SyncEngine {
  constructor(client: SupabaseClient<Database>, db: SqlExecutor)
  async sync(userId): Promise<{ pushed, pullFailed, pushFailed, changedTables: Set<string> }>
  async getPendingCount(): Promise<number>
}
```
- `pushOrdering.ts` — orden de push respetando FKs (padres antes que hijos en insert/update; hijos antes que padres en delete).
- `pendingOpsQueue.ts` — cola SQLite durable con reintentos/backoff.
- `pullChanges.ts` — pull real por tabla (`updated_at > watermark`, paginado).
- `applyRemoteRows.ts` — upsert de filas remotas; conflicto: **local gana si `_dirty`**, si no gana el `updated_at` más reciente.
- `watermarks.ts` — `sync_watermarks` por tabla para pull incremental.
- Tras cada op pusheada con éxito: se limpia `_dirty` (o se borra físicamente si tombstonada) solo si no quedan más pending_ops para esa fila.
- Mobile singleton: `lib/sync.ts` → `getSyncEngine()`.
- Triggers: `AppState` foreground + reconexión de red (`lib/netinfo.ts` → `useNetworkStatus()`) — ambos necesarios.

## Testing
- `testing/nodeSqlExecutor.ts` (better-sqlite3) + `runLocalMigrations(db)` → DB en memoria fresca por test.
- 87 tests en `packages/database` (16 archivos): local repos (workout/exercise/routine/body-tracker/goals/progress/preferences), local identity, claim, migrations, serializeExecutor, sync (applyRemoteRows/pendingOpsQueue/pushOrdering/syncEngine), nodeSqlExecutor. +9 en `packages/core` para `computePersonalRecordUpdate`, +4 para `usePreferencesStore`.

## Bugs reales encontrados y corregidos
1. `serializeExecutor` solapaba transacciones (Fase 2) — dos escrituras concurrentes podían intercalar statements.
2. `executeOperation` no comprobaba `result.error` tras insert/update/delete a Supabase (Fase 3) — un push fallido se daba por bueno.
3. `_dirty` nunca se limpiaba tras un push exitoso (Fase 3).
4. `deleteCategory` no ponía `category_id = NULL` en sus ejercicios (Fase 4).
5. `deleteExercise` no cascadeaba a workout_exercises/sets/routine_day_exercises/predefined_sets (Fase 4).
6. Local repos con reorder devolvían `{error}` único en vez de array — remotos devuelven array (uno por fila). Arreglado: `updates.map(() => ({error: null}))`.
7. Pantallas asumían `data` no-nulo tras comprobar solo `error` — válido con el discriminated union de Supabase, no con `{data: T|null, error}` de los repos locales. Comprobar siempre `if (error || !data)`.
8. La primera versión de `handleSessionChange` trataba cualquier `session === null` (incluida la comprobación de arranque en frío) como sign-out y vaciaba la DB — combinado con el bug de `force-stop` de abajo, habría borrado datos de una cuenta real. Corregido con `isExplicitSignOut` (solo `true` en el evento `SIGNED_OUT` real).

## Bug conocido sin arreglar (fuera de alcance de este plan)
**Sesión de Supabase no persiste tras `force-stop`**: `persistSession: true` + `FileStorage`, pero forzar el cierre del proceso y reabrir no reanuda la sesión pese a haber red. Con cuenta opcional ya no bloquea el arranque (bug 8 arriba), pero el sync queda parado en silencio hasta volver a iniciar sesión manualmente. No investigado a fondo — confirmado que no lo causa el trabajo de repos locales.

## Verificación manual en dispositivo — checklist repetible
1. `pm clear` + arranque en frío → entra directo a `(tabs)` sin login, `local_identity` con `is_guest=1`.
2. CRUD completo offline como invitado (workouts, ejercicios/categorías, rutinas, body tracker, goals) → igual que logueado.
3. Configuración → crear cuenta / iniciar sesión (`e2e-tests@fitnotes.local`) → confirmar en Supabase que las filas de invitado aparecen con el `user_id` real tras el claim, banner de sync llega a "idle".
4. `adb shell svc wifi disable && adb shell svc data disable` (más fiable que `airplane_mode_on` en este entorno).
5. Repetir CRUD offline ya logueado → igual, sin error hasta que el sync intente correr.
6. `force-stop` + reabrir offline → datos locales intactos; si la sesión no se restaura (bug conocido), sigue mostrando la cuenta activa sin pedir login ni borrar nada.
7. Reactivar red, reabrir/foreground → banner "Sincronizando…" → confirmar en Supabase que los cambios offline llegaron.
8. Cerrar sesión con cambios pendientes → aviso, y tras confirmar: DB vacía + nueva identidad invitado + vuelve a `(tabs)`.
9. Backup/CSV/recalcular PRs/restaurar/eliminar historial en modo invitado → mensaje "requiere una cuenta", no fallo silencioso.
10. ADB: usar SIEMPRE coordenadas de `uiautomator dump` (bounds reales), no las de un PNG escalado (factor 1.2x en el dispositivo de pruebas) — re-dumpear tras cualquier cambio de layout (teclado, colapso de panel).

**Resultado (2026-07-03, `ZY22G9PDSV`)**: puntos 1-9 confirmados. Único detalle: una rutina creada como invitado necesitó un segundo `sync()` (al re-foregroundear) para llegar a Supabase — no es un bug, es la cola `pending_ops` procesando de forma asíncrona. Datos de prueba borrados de la cuenta compartida después; dispositivo devuelto a `pm clear`.

**Fase 6 (PRs offline)**: crear categoría/ejercicio/rutina/set como invitado sin red → completar set con peso+reps → trofeo aparece en `workout/[exerciseId].tsx` y en Progreso sin esperar sync; resumen semanal agrega bien vía `getWeeklyTraining`. Confirmado.

**Lección de metodología (guardar para futuras verificaciones)**: un `TextInput` controlado puede mostrar en pantalla un valor que no llegó a persistir en SQLite (visto una vez: "80" en pantalla, `NULL` en DB, por un artefacto de timing de `adb input text` moviendo el foco antes de comitear la pulsación — no un bug de `maybeRecordPersonalRecord`, que correctamente no generó PR con peso nulo). Cuando la verificación por pantalla sea ambigua, usar un build **debug** temporal (`run-as`/`sqlite3` no funcionan sobre release) para inspeccionar la DB real en vez de fiarse del estado visual. Test de regresión cubriendo el caso exacto (`weight`/`reps` fijados en `updateSet` separados antes del `is_complete: true` final) añadido a `localWorkoutRepository.test.ts` — pasa.
