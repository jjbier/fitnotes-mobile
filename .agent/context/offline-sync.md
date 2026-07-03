# Offline sync — apps/mobile

_Last updated: 2026-07-03_

Plan completo en `/home/xabier/.claude/plans/precious-snuggling-shannon.md` (6 fases — la 7 original, bootstrap, se fusionó en la 5). Objetivo: CRUD completo sin red en mobile (workouts, ejercicios/categorías, rutinas, body tracker, goals, personal records), con **cuenta opcional** — la app funciona desde el primer arranque sin login, y crear/vincular una cuenta activa la sincronización. **Solo mobile** — web no cambia y sigue requiriendo cuenta.

## Estado por fase
| Fase | Contenido | Estado |
|---|---|---|
| 0 | De-risk `expo-sqlite` en el proyecto nativo a mano | ✅ |
| 1 | UUIDs reales, `SqlExecutor`, esquema local (13 tablas), migraciones, DI | ✅ |
| 2 | Workouts/workout_exercises/sets offline | ✅ |
| 3 | Motor de sync real (push/pull, cola durable, conflictos) | ✅ |
| 4 | Ejercicios/categorías/rutinas offline | ✅ |
| 5 | Cuenta opcional: identidad invitado, claim, bootstrap (sin módulo aparte, ver abajo), body tracker/goals offline, gating de funciones remote-only | ✅ |
| 6 | Personal records offline (réplica JS del trigger SQL) + lectura local de PRs/progreso semanal/mejores series | ✅ |

## Cuenta opcional — identidad invitado y claim (Fase 5)

- **`local_identity`** (tabla singleton, `packages/database/src/local/localIdentitySchema.ts` + `localIdentity.ts`): `{ active_user_id, is_guest }`. `getOrCreateLocalIdentity(db)` genera un UUID de invitado en el primer arranque; `setActiveIdentity(db, {userId, isGuest})` la actualiza tras un claim o un wipe.
- **`RepositoryContext`** resuelve esta identidad y expone `useRepositories() → { userId, isGuest, refreshIdentity, wipeAndSetIdentity }`. `userId` **siempre** está resuelto (invitado o real) — ninguna pantalla llama a `getSession()` para identidad de escritura local.
- **`_layout.tsx`** ya no fuerza login: arranque en frío → asegurar `local_identity` → navegar siempre a `(tabs)`. Login/registro son alcanzables desde Configuración, no un gate.
- **Claim** (`packages/database/src/sync/claimGuestData.ts` → `claimGuestIdentity(db, {guestUserId, realUserId})`): en una transacción, `UPDATE <tabla> SET user_id = realUserId WHERE user_id = guestUserId` en las 13 tablas + reescribe `user_id` en los payloads JSON de `pending_ops` ya encolados. Se dispara en `onAuthStateChange` cuando `session.user.id !== local_identity.active_user_id` y `is_guest = true`.
- **Bootstrap sin módulo aparte**: no existe `bootstrap.ts` — no hace falta. `pullTableChanges` ya hace un pull completo paginado cuando el watermark es `null` (dispositivo/cuenta nunca sincronizados), así que el `sync()` normal tras el claim ya trae todo el histórico de una cuenta existente. El orden push-antes-que-pull de `SyncEngine.sync()` es seguro aquí: las filas reclamadas quedan `_dirty=1` hasta que se pushean, y `applyRemoteRows` nunca pisa una fila `_dirty`.
- **`wipeAndSetIdentity`** (en `RepositoryContext`, no en `_layout.tsx` — necesita `setDb` para propagar el executor nuevo tras el wipe): `resetLocalDb()` (cierra+borra+reabre `expo-sqlite`, `apps/mobile/lib/db/client.ts`) → crea identidad → opcionalmente la fija a una cuenta real. Usado en sign-out y en el edge case de cambio directo entre dos cuentas reales.
- **Guard crítico de seguridad**: `handleSessionChange(session, isExplicitSignOut)` en `_layout.tsx` solo vacía la DB si `isExplicitSignOut` (evento `SIGNED_OUT` real) — **nunca** en la comprobación de sesión del arranque en frío, aunque devuelva `null`. Si no se distinguiera esto, el bug conocido "sesión no sobrevive a force-stop" borraría los datos de una cuenta real cada vez que la sesión no se restaura, en vez de simplemente fallar el sync en silencio.
- **`SyncEngine` no corre en modo invitado**: `runSync()` retorna temprano si `isGuest === true` — RLS/FK de Supabase (`user_id uuid references auth.users(id)`) rechazarían cualquier fila de invitado.
- **Gating de funciones remote-only**: backup/CSV, recalcular PRs, restaurar, eliminar historial con filtros y las estadísticas avanzadas (`getExerciseStats`, `getExerciseHistory`, `getRoutineStats`) siguen siendo remote-only — `settings.tsx` usa `requireAccount()` (helper local que alerta "esta función requiere una cuenta") antes de cada una.
- **Limitaciones aceptadas, no resueltas**: (a) mismo usuario en modo invitado en dos dispositivos antes de crear cuenta → ambos claims generan filas duplicadas al vincularse a la misma cuenta (sin dedup); (b) preferencias vía `user_metadata` (tema, unidades, toggles) no tienen fallback local — simplemente no se guardan en modo invitado.

## Personal records offline (Fase 6)

- **`computePersonalRecordUpdate()`** (`packages/core/src/utils/personalRecords.ts`): réplica pura del trigger SQL `update_personal_record` (`supabase/migrations/001_initial_schema.sql`) — gate `is_complete && weight != null && reps != null`, nuevo PR si `weight > max actual para (exercise_id, reps)`. **No filtra `is_warmup`**, igual que el trigger (gap conocido y deliberadamente no corregido aquí, para no divergir del histórico ya generado en producción).
- **`maybeRecordPersonalRecord()`** (privada, dentro de `localWorkoutRepository.ts`): corre dentro de la misma transacción que `updateSet` — tras el UPDATE, relee la fila del set, resuelve `exercise_id`/`user_id` via `workout_exercises`, calcula el máximo actual local para `(exercise_id, reps, user_id)` y, si `computePersonalRecordUpdate` devuelve un update, inserta una fila nueva en `personal_records` (`_dirty=1`) + `enqueuePendingOp`. Solo INSERT, nunca overwrite — igual que el trigger (histórico acumulativo; el valor vigente es el de mayor peso para ese `(exercise_id, reps)`).
- **`createLocalProgressRepository`** (`packages/database/src/local/repositories/localProgressRepository.ts`): lectura local de `getPersonalRecords`/`getAllPersonalRecords` (alimentadas por lo anterior) + `getWeeklyTraining`/`getBestSetsByExercise` — estas dos últimas son simples `JOIN`/`GROUP BY` sobre tablas ya locales (sets/workout_exercises/workouts), sin agregados propios de Postgres, así que se migraron también aunque no estaban en el plan original de la Fase 6 (evita que el resumen semanal del tab Progreso y el auto-check de goals sin PR de peso queden rotos en modo invitado). `getExerciseStats`/`getExerciseHistory`/`getRoutineStats`/`getChartData`/`convertExerciseWeights` siguen remote-only (analíticas más pesadas, fuera de alcance).
- Pantallas migradas al `progressRepo` local vía `useRepositories()`: `(tabs)/progress.tsx`, `goals/index.tsx`, `calculators.tsx` (selector de máximo). `workout/[exerciseId].tsx` usa **ambos**: `progressRepo` local (contexto) para el badge de PR por set, `remoteProgressRepo` (`createProgressRepository(supabase)`) para `getChartData` (fuera de alcance) — patrón "split-repo" ya usado en otras pantallas.
- **Duplicado esperado, no un bug**: si un workout se registra offline como invitado y luego se hace claim+sync, tanto el PR local (ya escrito) como el trigger SQL remoto (al insertar/actualizar el `set` vía push) pueden generar su propia fila — no hay dedup entre ambos mecanismos. Aceptado por ahora, mismo criterio que otras duplicaciones ya documentadas en este archivo.

## Decisión central
Capa de repos locales en SQLite que espeja 1:1 los repos de Supabase existentes: mismo patrón de fábrica, mismo shape `{data, error}`, mismos nombres de método. SQL crudo (sin ORM), coherente con el estilo ya usado para Supabase. El SQL executor se inyecta como interfaz (`SqlExecutor`) para poder testear con Vitest usando un driver Node (`better-sqlite3`) sin tocar `expo-sqlite`.

La base local es la única fuente de verdad para la UI. Las escrituras van siempre primero a local (instantáneas) y se encolan en `pending_ops` (SQLite, misma transacción que la escritura) para el push en background. Los repos remotos no desaparecen: los usa el `SyncEngine` (push/pull) y las pantallas para analíticas fuera de alcance offline.

## `packages/database/src/local/` — infraestructura
```
sqlExecutor.ts          interfaz SqlExecutor (execAsync/runAsync/getAllAsync/getFirstAsync/withTransactionAsync)
serializeExecutor.ts    envuelve un SqlExecutor para serializar accesos concurrentes (evita solapamiento de transacciones)
schema.ts               13 tablas + SYNCABLE_TABLES (las mismas 13) + índices
migrations.ts           runner versionado vía PRAGMA user_version
pendingOpsSchema.ts     tabla pending_ops (cola durable de escrituras a pushear)
pendingOps.ts           enqueuePendingOp(db, table, rowId, opType, payload), getPendingCount
watermarksSchema.ts     tabla sync_watermarks (marca de agua por tabla para pull incremental)
testing/nodeSqlExecutor.ts   driver Node (better-sqlite3) para Vitest
localIdentitySchema.ts  tabla singleton local_identity (invitado vs. cuenta real)
localIdentity.ts        getOrCreateLocalIdentity(db), setActiveIdentity(db, {userId, isGuest})
repositories/           localWorkoutRepository.ts, localExerciseRepository.ts, localRoutineRepository.ts,
                        localBodyTrackerRepository.ts, localGoalsRepository.ts, localProgressRepository.ts, shared.ts
```
`packages/database/src/sync/claimGuestData.ts` — `claimGuestIdentity(db, {guestUserId, realUserId})`, ver sección "Cuenta opcional" arriba.
13 tablas locales = las 13 de `SYNCABLE_TABLES`: categories, exercises, workouts, workout_exercises, sets, personal_records, routines, routine_days, routine_day_exercises, predefined_sets, body_measurements, body_measurement_entries, exercise_goals. Cada una: columnas de negocio + `id TEXT PRIMARY KEY` (UUID) + `user_id`, `updated_at`, `created_at` + `_dirty INTEGER` (cambios sin subir) + `_deleted INTEGER` (tombstone, no se borra físicamente hasta confirmar el push).

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
- **Cascadas manuales** (SQLite sin `PRAGMA foreign_keys`, a propósito — ver `architecture.md`): cada FK con `ON DELETE CASCADE` o `ON DELETE SET NULL` en el schema remoto debe replicarse a mano en el método del repo local que borra el padre. Lista actual:
  - `deleteWorkout` → cascada a `workout_exercises` → `sets` (Fase 2)
  - `deleteExercise` → cascada a `workout_exercises`→`sets` y `routine_day_exercises`→`predefined_sets` (`ON DELETE CASCADE` remoto) — **bug corregido en Fase 4**, faltaba
  - `deleteCategory` → `SET NULL` en `category_id` de sus ejercicios (`ON DELETE SET NULL` remoto) — **bug corregido en Fase 4**, faltaba
  - `deleteRoutine`/`deleteDay`/`removeExercise` (rutinas) → cascada completa día→ejercicios→predefined_sets (`ON DELETE CASCADE` remoto)
  - `deleteMeasurement` (body tracker) → cascada a `body_measurement_entries` (`ON DELETE CASCADE` remoto)
  - **Al añadir un nuevo `deleteXxx` a un repo local: revisar la FK real en `supabase/migrations/001_initial_schema.sql` antes de asumir el comportamiento — SET NULL y CASCADE se ven casi igual si no se verifica.**

## Repos locales — alcance (qué se queda en remoto)
| Repo local | Cubre | Se queda en el repo remoto (fuera de alcance offline) |
|---|---|---|
| `localWorkoutRepository` | workouts, workout_exercises, sets — CRUD completo, incl. generación de `personal_records` en `updateSet` (Fase 6, ver arriba) | `exportAllCSV`, `shareWorkout`, `deleteWorkoutHistory` |
| `localExerciseRepository` | categorías + ejercicios — CRUD completo | `getExerciseHistory`, `convertExerciseWeights`, `getExerciseStats` |
| `localRoutineRepository` | rutinas, días, ejercicios por día, predefined sets, `copyRoutine` (deep) — CRUD completo | `getRoutineStats` |
| `localBodyTrackerRepository` | medidas + registros — CRUD completo, incl. `seedDefaultMeasurementsIfNeeded` | `exportAllCSV` |
| `localGoalsRepository` | goals (`upsertGoal` traduce el `onConflict: user_id,exercise_id` remoto a `INSERT ... ON CONFLICT DO UPDATE` local) | — |
| `localProgressRepository` (Fase 6) | `getPersonalRecords`, `getAllPersonalRecords`, `getWeeklyTraining`, `getBestSetsByExercise` — lecturas simples sobre tablas ya locales | `getExerciseStats`, `getExerciseHistory`, `getRoutineStats`, `getChartData`, `convertExerciseWeights` |

Patrón "split-repo" en pantallas que mezclan ambos: instanciar el repo local vía `useRepositories()` para el CRUD **y además** `useMemo(() => createExerciseRepository(supabase), [])` (u otro remoto) solo para los métodos fuera de alcance. Ejemplo: `(tabs)/exercises.tsx`, `exercises/[categoryId].tsx`, `(tabs)/tools.tsx`, `exercise-history/[exerciseId].tsx`.

## DI — `RepositoryContext`
- `apps/mobile/lib/db/client.ts` → `getLocalDb(): Promise<SqlExecutor>` — abre `expo-sqlite` (singleton `dbPromise`), aplica migraciones, envuelve con `serializeExecutor`. `resetLocalDb()` — cierra+borra+reabre (sign-out/cambio de cuenta).
- `apps/mobile/contexts/RepositoryContext.tsx` → `<RepositoryProvider>` construye los 6 repos locales una vez (`useMemo`) y resuelve `local_identity`, exponiendo `useRepositories()` → `{ db, workoutRepo, exerciseRepo, routineRepo, bodyTrackerRepo, goalsRepo, progressRepo, userId, isGuest, refreshIdentity, wipeAndSetIdentity }`. Gatea el render con loading state hasta que tanto `getLocalDb()` como la identidad resuelven.
- **Regla:** ninguna pantalla debe instanciar `createXxxRepository(supabase)` para CRUD, ni llamar a `getSession()` para obtener un `userId` de escritura — solo `useRepositories()`. `createXxxRepository(supabase)` solo se instancia para los métodos "fuera de alcance" de la tabla de arriba, o dentro del propio `SyncEngine`.
- `_layout.tsx` envuelve el árbol con `RepositoryProvider` (dentro del `GestureHandlerRootView`); toda la lógica de auth/sync vive en un componente hijo (`AppContent`) para poder usar `useRepositories()`. Su lógica de post-sync no vuelve a pedir datos a Supabase: usa `getLocalDb()` + `createLocalExerciseRepository`/`createLocalRoutineRepository` para releer lo que `applyRemoteRows` ya escribió en SQLite.

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
- `pullChanges.ts` — pull real por tabla (`updated_at > watermark`, paginado), reemplaza el pull "solo cuenta filas" del motor viejo.
- `applyRemoteRows.ts` — upsert de filas remotas en SQLite; conflicto: **local gana si `_dirty`**, si no gana el `updated_at` más reciente.
- `watermarks.ts` — `sync_watermarks` por tabla para pull incremental.
- Tras cada op pusheada con éxito: se limpia `_dirty` (o se borra físicamente la fila tombstonada) solo si no quedan más pending_ops para esa fila.
- Mobile singleton: `apps/mobile/lib/sync.ts` → `getSyncEngine()`.
- Triggers de sync: `AppState` (foreground) en `_layout.tsx` **y** reconexión de red (`apps/mobile/lib/netinfo.ts` → `useNetworkStatus()`, vía `@react-native-community/netinfo`) — ambos necesarios, uno no cubre al otro.

## Testing
- `packages/database/src/local/testing/nodeSqlExecutor.ts` (better-sqlite3) + `runLocalMigrations(db)` → DB SQLite en memoria fresca por test.
- Un test ejercita el repo local directamente, sin mockear la lógica — solo el driver SQL cambia (Node vs expo-sqlite).
- 82 tests en `packages/database` (15 archivos): local repos (workout/exercise/routine/body-tracker/goals/progress), local identity, claim, migrations, serializeExecutor, sync (applyRemoteRows, pendingOpsQueue, pushOrdering, syncEngine), nodeSqlExecutor. +9 tests en `packages/core` para `computePersonalRecordUpdate`.

## Bugs reales encontrados y corregidos
1. **`serializeExecutor` solapaba transacciones** (Fase 2) — dos escrituras concurrentes podían intercalar sus statements.
2. **`executeOperation` no comprobaba `result.error`** tras insert/update/delete a Supabase (Fase 3) — un push fallido se daba por bueno.
3. **`_dirty` nunca se limpiaba** tras un push exitoso (Fase 3) — toda fila quedaba marcada sucia para siempre.
4. **`deleteCategory` no ponía `category_id = NULL`** en sus ejercicios (Fase 4) — ver tabla de cascadas arriba.
5. **`deleteExercise` no cascadeaba** a workout_exercises/sets/routine_day_exercises/predefined_sets (Fase 4) — ver tabla de cascadas arriba.
6. **Local repos con reorder devolvían `{error}` único en vez de array** (`reorderCategories`/`reorderExercises`/`reorderDays`) — los repos remotos devuelven un array (uno por fila vía `Promise.all`), y las pantallas hacían `results.some(r => r.error)`. Arreglado para devolver `updates.map(() => ({error: null}))`.
7. **Pantallas asumían `data` no-nulo tras comprobar solo `error`** — funciona con el discriminated union de Supabase (`.single()`), no con el tipo `{data: T|null, error}` de los repos locales. Hay que comprobar `if (error || !data)` explícitamente en cualquier código nuevo contra un repo local.
8. **Riesgo detectado y corregido antes de publicar la Fase 5**: la primera versión de `handleSessionChange` trataba *cualquier* `session === null` (incluida la comprobación de sesión del arranque en frío) como un sign-out y vaciaba la DB local. Combinado con el bug de `force-stop` de abajo, esto habría borrado los datos de una cuenta real cada vez que la sesión no se restauraba tras matar el proceso. Corregido añadiendo el parámetro `isExplicitSignOut` (solo `true` cuando `onAuthStateChange` reporta el evento `SIGNED_OUT`).

## Bug conocido sin arreglar (fuera de alcance de este plan)
**Sesión de Supabase no persiste tras `force-stop`**: `lib/supabase.ts` configura `persistSession: true` con `FileStorage` (expo-file-system), pero forzar el cierre del proceso y reabrir no reanuda la sesión — incluso con red disponible. Con cuenta opcional (Fase 5) ya no bloquea el arranque (ver bug 8 arriba: se maneja sin destruir datos), pero el sync queda parado en silencio hasta volver a iniciar sesión manualmente. No investigado a fondo. Confirmado que NO lo causa el trabajo de repos locales (no se tocó código de auth).

## Verificación manual en dispositivo — ✅ hecha 2026-07-03 (checklist repetible para futuros cambios)
1. `pm clear` + arranque en frío → debe entrar directo a `(tabs)` sin pantalla de login, `local_identity` creada con `is_guest=1`.
2. CRUD completo offline como invitado (entrenamientos, ejercicios/categorías, rutinas, body tracker, goals) → confirmar que funciona igual que logueado.
3. Configuración → "Crear cuenta" o "Iniciar sesión para sincronizar" con `e2e-tests@fitnotes.local` (cuenta compartida, no la del usuario — ver `todo.md`/memoria) → confirmar en Supabase (Management API) que las filas creadas como invitado aparecen con el `user_id` real tras el claim, y que el banner de sync llega a "idle".
4. `adb shell svc wifi disable && adb shell svc data disable` (más fiable que `airplane_mode_on`, que requiere un broadcast sin permisos en este entorno).
5. Repetir CRUD offline ya logueado → debe funcionar igual, sin banner de error hasta que el sync intente correr.
6. `adb shell am force-stop com.fitnotes.app` + reabrir **offline** → los datos locales creados deben seguir ahí; si la sesión no se restaura (bug conocido), debe seguir mostrando la cuenta como activa sin pedir login ni borrar nada — solo el sync queda parado.
7. `adb shell svc wifi enable && adb shell svc data enable`, reabrir/foreground la app → banner "Sincronizando…" → confirmar en Supabase que los cambios offline llegaron.
8. Cerrar sesión con cambios sin sincronizar pendientes → confirmar aviso, y tras confirmar, DB local vacía + nueva identidad invitado + vuelve a `(tabs)` (no a login).
9. Backup/CSV/recalcular PRs/restaurar/eliminar historial en modo invitado → confirmar mensaje "requiere una cuenta" en vez de fallo silencioso.
10. Al automatizar con `adb shell input tap`: usar SIEMPRE coordenadas de `uiautomator dump` (bounds reales), no las de un PNG de `screencap` escalado — en el dispositivo de pruebas el factor es 1.2x (1080×2400 real vs 900×2000 renderizado). Cuidado extra con formularios: tras abrir el teclado el layout se desplaza, así que hay que re-dumpear bounds en vez de reusar coordenadas de antes de que apareciera el teclado.

**Resultado de la pasada 2026-07-03** (dispositivo `ZY22G9PDSV`, build reinstalada): todos los puntos 1-9 confirmados correctos. Único detalle: la rutina creada como invitado no apareció en Supabase en la primera consulta tras el claim — necesitó un segundo `sync()` (disparado al re-foregroundear la app) para llegar. No es un bug: es la cola de `pending_ops` procesándose de forma asíncrona: la categoría y el ejercicio sí llegaron en el primer push. Los tres registros de prueba (categoría "Pecho", ejercicio "Press banca", rutina "Rutina Test") se borraron de Supabase después para no ensuciar la cuenta compartida `e2e-tests@fitnotes.local`, y el dispositivo se dejó en `pm clear` (invitado limpio, sin sesión).

## Verificación manual de la Fase 6 (PRs offline) — ✅ hecha 2026-07-03

Checklist específico, ejecutado sobre el mismo dispositivo tras el rebuild de la Fase 6:
1. Crear categoría/ejercicio/rutina/set como invitado (sin red) → completar un set con peso+reps → confirmar que aparece el trofeo 🏆 en la cabecera de `workout/[exerciseId].tsx` y en la pestaña Progreso (`getAllPersonalRecords` local), sin esperar a sync.
2. Confirmar que el resumen semanal ("Esta semana") de la pestaña Progreso agrega correctamente el volumen/series por categoría usando `getWeeklyTraining` local.
3. Confirmado en ambos puntos — con un matiz real durante la prueba (ver hallazgo abajo).

**Hallazgo durante la verificación (no es un bug de la Fase 6, documentado para no repetir la confusión)**: en el primer intento, el campo de peso (`TextInput` controlado, `onChangeText` por pulsación) quedó en `NULL` en SQLite pese a mostrarse "80" en pantalla — inspección directa de la DB local (vía un build **debug** reinstalado temporalmente sobre los mismos datos, con `adb shell run-as com.fitnotes.app cat .../fitnotes.db` + `sqlite3` en local, ya que el release no es `debuggable` y `run-as`/`sqlite3` no funcionan sobre él) confirmó `sets.weight = NULL, reps = 8, is_complete = 1`. `maybeRecordPersonalRecord` **correctamente** no generó un PR (falta el peso) — el bug era de automatización ADB (una pulsación de teclado no llegó a commitear antes de mover el foco a otro campo), no de la lógica de la Fase 6. Al corregir el peso a mano el PR se generó y mostró de inmediato (trofeo + Progreso), confirmando el pipeline completo. **Lección para futuras verificaciones con ADB**: tras escribir en un `TextInput` numérico controlado, verificar el valor mostrado en pantalla ANTES de mover el foco no es suficiente prueba de que persistió — si hay dudas, usar un build debug + `run-as`/`sqlite3` para leer la DB real en vez de fiarse solo del estado visual (que puede reflejar el store optimista de Zustand, no la escritura en SQLite).
- Test de regresión añadido (`localWorkoutRepository.test.ts`): completar un set cuando `weight`/`reps` se fijaron en llamadas `updateSet` **separadas** antes del `updateSet({is_complete: true})` final — pasa, confirma que `maybeRecordPersonalRecord` lee la fila fusionada correcta desde SQLite, no solo el patch de la última llamada.
