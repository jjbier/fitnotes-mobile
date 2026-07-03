# FitNotes App — CLAUDE.md

## Objetivo
App de fitness tracking (workout logging, PRs, rutinas, body tracker, calculadoras). Web (Next.js 15) + mobile (Expo SDK 52) comparten lógica vía `@fitnotes/core`. Todo en **español**. Paridad completa con la app de referencia FitNotes (Fases 0–5 web/mobile, `docs/implementation-plan-2026-07.md`), incluida paridad **visual** (2026-07-02). Mobile además es **100% offline con cuenta opcional**: funciona sin cuenta desde el primer arranque (modo invitado), y la cuenta real solo activa la sincronización (plan aparte, ver abajo).

## Arquitectura
```
apps/web            Next.js 15 App Router
apps/mobile         Expo SDK 52 + Expo Router v4 — offline-first (SQLite local + sync)
packages/core       lógica pura — CERO imports react/next/expo
packages/database   cliente Supabase + repositorios remotos + repos locales SQLite + SyncEngine
packages/ui         vacío, sin spec
```
Detalle en `.agent/context/`: `architecture.md`, `apps-web.md`, `apps-mobile.md`, `packages-core.md`, `packages-database.md`, `repositories.md`, `offline-sync.md`, `stores.md`, `status.md`, `todo.md`.

## Stack y dependencias clave
- Turborepo 2 + pnpm workspaces; TS strict + `verbatimModuleSyntax`
- Supabase (ref `fbhjiwtriqrxibqwsyqj`); `@supabase/supabase-js@2.108.2` + `@supabase/ssr@0.12.0` **fijas** (mezclar versiones rompe genéricos)
- Zustand 5 + Immer (stores en core)
- Web: Tailwind v4 (requiere `@theme inline` en `globals.css` — ver bug abajo), `lucide-react` para iconos, `ConfirmDialog` propio (no `confirm()` nativo), shadcn/ui NO inicializado
- Mobile: StyleSheet only (NO NativeWind en componentes), `FileStorage` como auth storage (no AsyncStorage), `expo-sqlite@~15.1.4` (DB local), `expo-crypto@~14.0.2` (polyfill UUID), `@react-native-community/netinfo@11.4.1` (detección de reconexión)
- Tests: Vitest (core 215 tests, database 82 tests), Playwright (web E2E, 13 specs/66 tests), Detox (mobile E2E, `android.attached`, dispositivo físico)

## Decisiones arquitectónicas clave
- Repository pattern `createXxxRepository(client)` (remoto) espejado 1:1 por `createLocalXxxRepository(db: SqlExecutor)` (local) — mismos nombres de método, mismo shape `{data, error}`. Detalle en `offline-sync.md`
- Mobile: la UI SOLO habla con los repos locales (vía `useRepositories()` / `RepositoryContext`); los repos remotos quedan reservados al `SyncEngine` y a analíticas pesadas fuera de alcance offline (`getExerciseStats`, `getExerciseHistory`, `getRoutineStats`, `convertExerciseWeights`, backup/CSV)
- **Cuenta opcional (mobile)**: `local_identity` (tabla singleton SQLite) resuelve un `userId` siempre presente — un UUID de invitado generado en el dispositivo, o el `auth.uid()` real tras vincular cuenta. `useRepositories()` expone `{ userId, isGuest }`; ninguna pantalla llama a `getSession()` para identidad de escritura. El `SyncEngine` no corre mientras `isGuest === true` (RLS/FK de Supabase rechazarían filas de invitado). Al crear/iniciar sesión, `claimGuestIdentity()` reescribe `user_id` (invitado→real) en las 13 tablas locales y en los payloads de `pending_ops` ya encolados, dentro de una única transacción — luego el `sync()` normal hace de bootstrap (watermarks vacíos ⇒ pull completo). Detalle en `offline-sync.md`
- UUIDs reales generados en cliente (`generateUUID()` en core) — nunca IDs temporales; permite escribir offline con el ID definitivo desde el insert
- `ExerciseType` cast obligatorio al mapear Supabase → core
- 1RM Brzycki; PR auto-actualizado vía trigger SQL (remoto) **y** réplica JS en local (`computePersonalRecordUpdate`, Fase 6 offline) — ambos pueden generar filas para el mismo evento tras sync (duplicado aceptado, ver `offline-sync.md`); RLS `auth.uid()=user_id` en todas las tablas
- Supersets: `group_id`/`group_name` compartidos en `routine_day_exercises` y `workout_exercises`
- Home Screen Settings (categorías ocultas): client-side (localStorage web / `user_metadata` mobile), sin campo en DB — **no funciona en modo invitado** (ver Bugs conocidos)
- Lista completa de decisiones: `.agent/context/architecture.md` y `.agent/context/offline-sync.md`

## Estado actual — qué funciona
Web/mobile: Fases 0–5 de paridad con la app de referencia completas, sin gaps funcionales.
Mobile offline (plan de 7 fases → 6 tras fusionar bootstrap en Fase 5, `.agent/context/offline-sync.md`): **Fases 0–6 completas** — offline 100% funcional salvo backup/CSV/restaurar/eliminar historial/estadísticas avanzadas.
- `packages/core` ✅ 215 tests Vitest (+9 de `computePersonalRecordUpdate`, réplica del trigger SQL de PRs)
- `packages/database` ✅ 8 repositorios remotos + 6 repos locales (workout/exercise/routine/body-tracker/goals/progress) + `SyncEngine` v2 (push/pull real, cola durable en SQLite) + `claimGuestIdentity()` — 82 tests Vitest
- `apps/web` ✅ todas las rutas, nav de 6 secciones (igual que mobile), `/search` global, dashboard con franja semanal+racha+drag&drop+multi-select+resumen final, accesibilidad WCAG AA, CSP, CI/CD. **Sin cambios offline** (fuera de alcance, solo mobile; web sigue requiriendo cuenta)
- `apps/mobile` ✅ APK release estable (dispositivo `ZY22G9PDSV`), mismas 6 tabs, Detox funcional. **App 100% funcional sin cuenta desde el arranque** (modo invitado): CRUD de entrenamientos/ejercicios/categorías/rutinas/body tracker/goals offline, PRs generados localmente al completar sets (Fase 6), badge de PR/tab Progreso/goals leyendo de SQLite local. Cuenta pasa a ser opcional — alcanzable desde Configuración ("Crear cuenta"/"Iniciar sesión para sincronizar"), no un gate de arranque. Backup/CSV/recalcular PRs (remoto)/restaurar/eliminar historial/estadísticas avanzadas siguen requiriendo cuenta real (gateadas con aviso "requiere una cuenta")
- Ambos ✅ fechas en español, colores/tema renderizando correctamente en web

## Bugs conocidos / no repetir
- **Sesión Supabase no sobrevive a `force-stop` en mobile**: pese a `persistSession: true` + `FileStorage`, tras matar el proceso (`am force-stop`) la sesión no se restaura. Con cuenta opcional (Fase 5) esto ya no bloquea el arranque (la app siempre entra a `(tabs)`), pero el dispositivo queda "atascado" mostrando la cuenta real como activa (`local_identity.is_guest=false`) sin sesión válida — el sync falla en silencio hasta volver a iniciar sesión manualmente desde Configuración. **Importante:** `_layout.tsx` distingue explícitamente un `SIGNED_OUT` real de esta comprobación de sesión fallida (parámetro `isExplicitSignOut` en `handleSessionChange`) — tratar "sin sesión" como sign-out en el arranque en frío borraría datos de una cuenta real sin haber confirmado que el usuario cerró sesión. **Sin fix de fondo todavía** (la sesión sigue sin restaurarse tras force-stop).
- **Preferencias de usuario (`user_metadata`) no funcionan en modo invitado**: tema, unidad de peso, incremento por defecto, orden de calendario, etc. se guardan vía `supabase.auth.updateUser()` — sin cuenta real, estas llamadas no tienen dónde persistir. Hoy simplemente no se guardan (degradación silenciosa a los valores por defecto), no hay fallback local. Gap conocido, no resuelto en la Fase 5 de cuenta opcional.
- **`deleteCategory` no limpiaba `category_id` en sus ejercicios** (local): la FK remota es `ON DELETE SET NULL`; el repo local solo tombstonaba la categoría, dejando ejercicios con un `category_id` colgante. Arreglado (ver `offline-sync.md`).
- **`deleteExercise` no cascadeaba** a `workout_exercises`/`sets`/`routine_day_exercises`/`predefined_sets` (local): la FK remota es `ON DELETE CASCADE`. Arreglado.
- **Automatización ADB con `input text` y coordenadas**: los taps deben usar las coordenadas REALES del dispositivo (`uiautomator dump`), no las del PNG del screenshot escalado — factor 1.2x en este dispositivo (1080×2400 real vs 900×2000 mostrado). Olvidar el factor es la causa más común de "tap en el elemento equivocado" al testear.
- **Tailwind v4 sin `@theme`**: `bg-primary`, `text-muted-foreground`, `bg-secondary`, etc. llevaban TODA la historia del proyecto sin generar ninguna regla CSS real — Tailwind v4 no reconoce colores custom sin `@theme`. Arreglado en `apps/web/app/globals.css`. Los tests de Playwright no lo detectaban (comprueban DOM/roles, no colores) → **verificar visualmente con screenshot tras cambios de estilo**, no confiar solo en tests de rol/texto.
- **`formatWorkoutDate` en inglés**: arrays de día/mes hardcodeados en inglés en `packages/core/src/utils/dateUtils.ts` pese a que toda la app es en español — traducido y reordenado a convención española ("día de mes de año").
- **Gradle no detecta cambios en `packages/core`/`packages/database`**: `./gradlew assembleRelease` puede marcar `createBundleReleaseJsAndAssets` UP-TO-DATE aunque cambie código de un paquete compartido → APK con bundle JS stale. Si se toca cualquiera de los dos y el cambio no aparece en el APK: `cd apps/mobile/android && ./gradlew createBundleReleaseJsAndAssets --rerun-tasks --no-daemon` antes de `assembleRelease`.
- **Detox pisa la build release**: debug y release comparten `applicationId` (`com.fitnotes.app`) — instalar la build debug de Detox para testear sobrescribe la release ya instalada. Reinstalar la release al terminar de testear con Detox.
- **`Alert.alert` en Android**: máximo 3 botones nativos, un 4º se descarta en silencio sin error. Usar `Modal` propio si se necesitan más opciones.
- **`confirm()` nativo → `ConfirmDialog`** en web: specs que esperaban `page.once("dialog", ...)` deben clicar el botón real del `role="alertdialog"` ahora.

## Pendiente inmediato
- **Duplicado de PRs tras claim+sync**: un PR generado offline (JS) y el mismo PR regenerado por el trigger SQL remoto al pushear el set pueden convivir como dos filas distintas — sin dedup entre ambos mecanismos. Aceptado, no bloquea (ver `offline-sync.md`)
- **Preferencias en modo invitado**: sin fallback local para `user_metadata` (tema, unidades, toggles) — decidir si vale la pena un store local o se acepta como limitación permanente
- **Multi-dispositivo en modo invitado**: si el mismo usuario usa invitado en dos dispositivos antes de crear cuenta, ambos claims generan filas duplicadas al vincularse a la misma cuenta (sin deduplicación) — limitación aceptada, documentada en `offline-sync.md`
- `packages/ui` vacío, sin spec
- **EAS `projectId`**: placeholder en `app.json`, requiere `eas init` con cuenta Expo real
- Cuenta de test Supabase (`e2e-tests@fitnotes.local`) compartida y frágil — algunos specs asumen que existen/no existen workouts en fechas relativas ("ayer", "hace 3 días"); si un spec falla por datos, revisar el estado de la cuenta antes de asumir bug de código
- Sin gaps funcionales conocidos vs. la app de referencia (paridad web/mobile Fases 0–5); plan offline mobile completo (Fases 0–6), verificado en dispositivo físico 2026-07-03 (ver `offline-sync.md`)

## Comandos
```bash
pnpm --filter @fitnotes/web dev
pnpm --filter @fitnotes/mobile start
pnpm --filter @fitnotes/core test
pnpm --filter @fitnotes/database test
cd apps/web && PLAYWRIGHT_USER_EMAIL=x PLAYWRIGHT_USER_PASSWORD=y npx playwright test
cd apps/mobile/android && ./gradlew createBundleReleaseJsAndAssets --rerun-tasks --no-daemon && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```
Detox (gotchas de configuración, comandos): ver `.agent/context/apps-mobile.md`. Plan y arquitectura offline completos: ver `.agent/context/offline-sync.md`.
