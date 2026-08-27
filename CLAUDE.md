# FitNotes Mobile — CLAUDE.md

## Objetivo
App de fitness tracking (workout logging, PRs, rutinas, body tracker, calculadoras) en Expo SDK 52. Mayormente en **español** — desde 2026-07-16 hay infraestructura i18n (`react-i18next` + `i18next`) con diccionarios `es`/`en` en `packages/core/src/i18n/locales/`, pero **solo la pantalla de Settings está migrada** (piloto); el resto de la app sigue con strings hardcodeados en español, migración pendiente pantalla a pantalla. Paridad completa con la app de referencia FitNotes (Fases 0–5, `docs/implementation-plan-2026-07.md`), incluida paridad **visual** (2026-07-02). Además es **100% offline con cuenta opcional**: funciona sin cuenta desde el primer arranque (modo invitado), y la cuenta real solo activa la sincronización (plan aparte, ver abajo).

## Arquitectura
```
apps/mobile         Expo SDK 52 + Expo Router v4 — offline-first (SQLite local + sync)
packages/core       lógica pura — CERO imports react/next/expo
packages/database   cliente Supabase + repositorios remotos + repos locales SQLite + SyncEngine
packages/ui         vacío, sin spec
```
`packages/core` y `packages/database` son propios de este repo (duplicados desde el monorepo original al separar mobile y web en repos independientes) — ya no se comparten en vivo con ninguna app web.

Detalle en `.agent/context/`: `architecture.md`, `apps-mobile.md`, `packages-core.md`, `packages-database.md`, `repositories.md`, `offline-sync.md`, `stores.md`, `status.md`, `todo.md`.

## Stack y dependencias clave
- Turborepo 2 + pnpm workspaces (app + packages internos); TS strict + `verbatimModuleSyntax`
- Supabase (ref `fbhjiwtriqrxibqwsyqj`); `@supabase/supabase-js@2.108.2` **fija** (mezclar versiones rompe genéricos)
- Zustand 5 + Immer (stores en core)
- StyleSheet only (NO NativeWind en componentes), `FileStorage` como auth storage (no AsyncStorage), `expo-sqlite@~15.1.4` (DB local), `expo-crypto@~14.0.2` (polyfill UUID), `@react-native-community/netinfo@11.4.1` (detección de reconexión)
- Tests: Vitest (core 219 tests, database 87 tests), Detox (mobile E2E, `android.attached`, dispositivo físico)

## Decisiones arquitectónicas clave
- Repository pattern `createXxxRepository(client)` (remoto) espejado 1:1 por `createLocalXxxRepository(db: SqlExecutor)` (local) — mismos nombres de método, mismo shape `{data, error}`. Detalle en `offline-sync.md`
- La UI SOLO habla con los repos locales (vía `useRepositories()` / `RepositoryContext`); los repos remotos quedan reservados al `SyncEngine` y a analíticas pesadas fuera de alcance offline (`getExerciseStats`, `getExerciseHistory`, `getRoutineStats`, `convertExerciseWeights`, backup/CSV)
- **Cuenta opcional**: `local_identity` (tabla singleton SQLite) resuelve un `userId` siempre presente — un UUID de invitado generado en el dispositivo, o el `auth.uid()` real tras vincular cuenta. `useRepositories()` expone `{ userId, isGuest }`; ninguna pantalla llama a `getSession()` para identidad de escritura. El `SyncEngine` no corre mientras `isGuest === true` (RLS/FK de Supabase rechazarían filas de invitado). Al crear/iniciar sesión, `claimGuestIdentity()` reescribe `user_id` (invitado→real) en las 13 tablas locales y en los payloads de `pending_ops` ya encolados, dentro de una única transacción — luego el `sync()` normal hace de bootstrap (watermarks vacíos ⇒ pull completo). Detalle en `offline-sync.md`
- UUIDs reales generados en cliente (`generateUUID()` en core) — nunca IDs temporales; permite escribir offline con el ID definitivo desde el insert
- `ExerciseType` cast obligatorio al mapear Supabase → core
- 1RM Brzycki; PR auto-actualizado vía trigger SQL (remoto) **y** réplica JS en local (`computePersonalRecordUpdate`, Fase 6 offline) — ambos pueden generar filas para el mismo evento tras sync (duplicado aceptado, ver `offline-sync.md`); RLS `auth.uid()=user_id` en todas las tablas
- Supersets: `group_id`/`group_name` compartidos en `routine_day_exercises` y `workout_exercises`
- Home Screen Settings (categorías ocultas): client-side (preferencias mobile), sin campo en DB
- **Preferencias offline**: `UserPreferences` (17 claves: idioma, tema, unidades, toggles de entrenamiento, timer, calendario, categorías ocultas) vive en `packages/core` con `usePreferencesStore` (zustand) + `createLocalPreferencesRepository` (tabla `user_preferences`, clave/valor en SQLite, no sincronizable). Siempre resueltas (invitado o cuenta real) — reemplaza el patrón anterior de leer/escribir `user_metadata` directamente en cada pantalla. Con cuenta real, cada escritura también actualiza `user_metadata` en segundo plano (sync entre dispositivos); al iniciar sesión, `_layout.tsx` hidrata la tabla local con el valor remoto (remoto gana). Detalle en `offline-sync.md`
- **i18n (2026-07-16/17)**: `react-i18next` + `i18next` (`expo-localization` para detectar el idioma del dispositivo como estimación inicial). Diccionarios `es`/`en` en `packages/core/src/i18n/locales/` (namespaces `common`/`settings`/`exercises`/`exerciseCatalog`/`progress`), con test de paridad de claves (`i18n.test.ts`) para que ambos idiomas no diverjan. Idioma persistido como preferencia de usuario (`UserPreferences.language`, ver arriba) — `_layout.tsx` llama a `i18n.changeLanguage()` al hidratar preferencias. El catálogo de ejercicios por defecto (`resolveDefaultExerciseCatalog`) también se traduce: los 96 ejercicios/8 categorías se crean en el idioma activo. **Migradas: Settings, Ejercicios y Progreso** (récords/gráfica/historial/estadísticas/objetivos); el resto de la app (workout, calendario, rutinas, body tracker, etc.) sigue con strings hardcodeados en español — migrar pantalla a pantalla añadiendo su namespace a `locales/es.ts`/`en.ts` en ambos idiomas a la vez (el test de paridad falla si no). El mapa `EXERCISE_TYPE_LABELS` de `packages/core/src/utils/calculations.ts` (usado en más pantallas aún no migradas, p.ej. workout) sigue sin traducir a propósito, igual que el locale `"es-ES"` hardcodeado en varios `toLocaleDateString` (formato de fecha, migración aparte).
- Lista completa de decisiones: `.agent/context/architecture.md` y `.agent/context/offline-sync.md`

## Estado actual — qué funciona
Fases 0–5 de paridad con la app de referencia completas, sin gaps funcionales.
Offline (plan de 7 fases → 6 tras fusionar bootstrap en Fase 5, `.agent/context/offline-sync.md`): **Fases 0–6 completas** — offline 100% funcional salvo backup/CSV/restaurar/eliminar historial/estadísticas avanzadas.
- `packages/core` ✅ 219 tests Vitest (+9 de `computePersonalRecordUpdate`, +4 de `usePreferencesStore`)
- `packages/database` ✅ 8 repositorios remotos + 6 repos locales (workout/exercise/routine/body-tracker/goals/progress) + repo de preferencias (`user_preferences`, no sincronizable) + `SyncEngine` v2 (push/pull real, cola durable en SQLite) + `claimGuestIdentity()` — 87 tests Vitest
- `apps/mobile` ✅ APK release estable (dispositivo `ZY22G9PDSV`), 6 tabs, Detox funcional. **App 100% funcional sin cuenta desde el arranque** (modo invitado): CRUD de entrenamientos/ejercicios/categorías/rutinas/body tracker/goals offline, PRs generados localmente al completar sets (Fase 6), badge de PR/tab Progreso/goals leyendo de SQLite local, preferencias (tema/unidades/toggles/timer/calendario) persistidas localmente y ya no se pierden en modo invitado. Cuenta pasa a ser opcional — alcanzable desde Configuración ("Crear cuenta"/"Iniciar sesión para sincronizar"), no un gate de arranque. Backup/CSV/recalcular PRs (remoto)/restaurar/eliminar historial/estadísticas avanzadas siguen requiriendo cuenta real (gateadas con aviso "requiere una cuenta")
- ✅ fechas en español

## Bugs conocidos / no repetir
- **Sesión Supabase no sobrevive a `force-stop`**: pese a `persistSession: true` + `FileStorage`, tras matar el proceso (`am force-stop`) la sesión no se restaura. Con cuenta opcional (Fase 5) esto ya no bloquea el arranque (la app siempre entra a `(tabs)`), pero el dispositivo queda "atascado" mostrando la cuenta real como activa (`local_identity.is_guest=false`) sin sesión válida — el sync falla en silencio hasta volver a iniciar sesión manualmente desde Configuración. **Importante:** `_layout.tsx` distingue explícitamente un `SIGNED_OUT` real de esta comprobación de sesión fallida (parámetro `isExplicitSignOut` en `handleSessionChange`) — tratar "sin sesión" como sign-out en el arranque en frío borraría datos de una cuenta real sin haber confirmado que el usuario cerró sesión. **Causa raíz encontrada y corregida en código** (2026-07-16, `apps/mobile/lib/supabase.ts`): `writeAll` borraba el archivo real antes de mover el temporal encima (`deleteAsync` + `moveAsync`), reabriendo una ventana sin archivo en disco — un `force-stop` justo ahí perdía la sesión. En Android, `moveAsync` ya hace un `rename(2)` atómico que sobrescribe el destino (confirmado en `FileSystemModule.kt` de `expo-file-system`); el borrado previo era innecesario y peligroso, se quitó. También se gatea `startAutoRefresh()` por conectividad real, no solo primer plano. Sin dispositivo físico en este entorno para confirmar el arreglo end-to-end — verificado por lectura de código nativo, no por reproducción.
- **`deleteCategory` no limpiaba `category_id` en sus ejercicios** (local): la FK remota es `ON DELETE SET NULL`; el repo local solo tombstonaba la categoría, dejando ejercicios con un `category_id` colgante. Arreglado (ver `offline-sync.md`).
- **`deleteExercise` no cascadeaba** a `workout_exercises`/`sets`/`routine_day_exercises`/`predefined_sets` (local): la FK remota es `ON DELETE CASCADE`. Arreglado.
- **Automatización ADB con `input text` y coordenadas**: los taps deben usar las coordenadas REALES del dispositivo (`uiautomator dump`), no las del PNG del screenshot escalado — factor 1.2x en este dispositivo (1080×2400 real vs 900×2000 mostrado). Olvidar el factor es la causa más común de "tap en el elemento equivocado" al testear.
- **Gradle no detecta cambios en `packages/core`/`packages/database`**: `./gradlew assembleRelease` puede marcar `createBundleReleaseJsAndAssets` UP-TO-DATE aunque cambie código de un paquete interno → APK con bundle JS stale. Si se toca cualquiera de los dos y el cambio no aparece en el APK: `cd apps/mobile/android && ./gradlew createBundleReleaseJsAndAssets --rerun-tasks --no-daemon` antes de `assembleRelease`.
- **Detox pisa la build release**: debug y release comparten `applicationId` (`com.fitnotes.app`) — instalar la build debug de Detox para testear sobrescribe la release ya instalada. Reinstalar la release al terminar de testear con Detox.
- **`Alert.alert` en Android**: máximo 3 botones nativos, un 4º se descarta en silencio sin error. Usar `Modal` propio si se necesitan más opciones.
- **`expo prebuild`/`expo run:android` falla en limpio (splash + Kotlin) — `android/` es gitignored, se regenera desde cero cada vez**: dos fallos encontrados y arreglados el 2026-08-27, sin relación con código de features:
  - **Splash faltante**: `app.json` no tenía imagen de splash (`"splash": {"resizeMode", "backgroundColor"}` sin `"image"`) → `expo prebuild` genera un `<drawable/splashscreen_logo>` en `values.xml` que no existe como recurso real → `app:processDebugResources` falla con "resource drawable/splashscreen_logo not found". **Arreglado en `app.json`** (persiste entre prebuilds): se quitó el `"splash"` legacy y se añadió el plugin `expo-splash-screen` con `image: "./assets/images/splash.png"`.
  - **Choque Kotlin/Compose Compiler**: `android/build.gradle` declara `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')` **sin versión** — Gradle resuelve una versión distinta (1.9.24) a la que usa `expo-modules-core` para elegir el Compose Compiler vía `ext.kotlinVersion` (1.9.25 por defecto, ver `versionsMap` en `expo-modules-core/android/build.gradle`), y el compilador de Kotlin real (1.9.24) no es compatible con el Compose Compiler 1.5.15 que se pidió para 1.9.25 → `expo-modules-core:compileDebugKotlin FAILED`. **No hay fix persistente** (vive en `android/build.gradle`, gitignored y regenerado en cada prebuild limpio) — tras cada `expo prebuild`/`expo run:android` desde cero, fijar a mano la versión: cambiar `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')` por `classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")` en `apps/mobile/android/build.gradle` antes de compilar. Si se repite a menudo, valorar mover el fix a un config plugin de Expo (`withAppBuildGradle`) para que sobreviva al prebuild.
- **Build debug local necesita `apps/mobile/.env`** (no versionado, solo hay `.env.example`): sin `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` la app crashea en cada pantalla con `Error: supabaseUrl is required` (visible como "Route ... is missing the required default export" en los logs de Metro, engañoso). La APK release instalada de antes ya los llevaba embebidos (vía EAS), pero un rebuild debug local (`expo run:android`) parte de cero y necesita el `.env` creado a mano.

## Pendiente inmediato
- **Duplicado de PRs tras claim+sync**: un PR generado offline (JS) y el mismo PR regenerado por el trigger SQL remoto al pushear el set pueden convivir como dos filas distintas — sin dedup entre ambos mecanismos. Aceptado, no bloquea (ver `offline-sync.md`)
- **Multi-dispositivo en modo invitado**: si el mismo usuario usa invitado en dos dispositivos antes de crear cuenta, ambos claims generan filas duplicadas al vincularse a la misma cuenta (sin deduplicación) — limitación aceptada, documentada en `offline-sync.md`
- `packages/ui` vacío, sin spec
- **EAS `projectId`**: placeholder en `app.json`, requiere `eas init` con cuenta Expo real
- Sin gaps funcionales conocidos vs. la app de referencia (paridad Fases 0–5); plan offline completo (Fases 0–6), verificado en dispositivo físico 2026-07-03 (ver `offline-sync.md`)

## Comandos
```bash
pnpm --filter @fitnotes/mobile start
pnpm --filter @fitnotes/core test
pnpm --filter @fitnotes/database test
cd apps/mobile/android && ./gradlew createBundleReleaseJsAndAssets --rerun-tasks --no-daemon && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```
Detox (gotchas de configuración, comandos): ver `.agent/context/apps-mobile.md`. Plan y arquitectura offline completos: ver `.agent/context/offline-sync.md`.
