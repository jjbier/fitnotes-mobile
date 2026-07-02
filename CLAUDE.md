# FitNotes App — CLAUDE.md

## Objetivo
App de fitness tracking (workout logging, PRs, rutinas, body tracker, calculadoras). Web (Next.js 15) + mobile (Expo SDK 52) comparten lógica vía `@fitnotes/core`. Todo en **español**. Paridad completa con la app de referencia FitNotes (Fases 0–5, ver `docs/implementation-plan-2026-07.md`) — incluye paridad **visual** web↔mobile (2026-07-02).

## Arquitectura
```
apps/web            Next.js 15 App Router
apps/mobile         Expo SDK 52 + Expo Router v4
packages/core       lógica pura — CERO imports react/next/expo
packages/database   cliente Supabase + repositorios
packages/ui         vacío, sin spec
```
Detalle en `.agent/context/`: `architecture.md`, `apps-web.md`, `apps-mobile.md`, `packages-core.md`, `packages-database.md`, `repositories.md`, `stores.md`, `status.md`, `todo.md`.

## Stack y dependencias clave
- Turborepo 2 + pnpm workspaces; TS strict + `verbatimModuleSyntax`
- Supabase (ref `fbhjiwtriqrxibqwsyqj`); `@supabase/supabase-js@2.108.2` + `@supabase/ssr@0.12.0` **fijas** (mezclar versiones rompe genéricos)
- Zustand 5 + Immer (stores en core)
- Web: Tailwind v4 (requiere `@theme inline` en `globals.css` — ver bug abajo), `lucide-react` para iconos, `ConfirmDialog` propio (no `confirm()` nativo), shadcn/ui NO inicializado
- Mobile: StyleSheet only (NO NativeWind en componentes), `FileStorage` como auth storage (no AsyncStorage)
- Tests: Vitest (core, 203 tests), Playwright (web E2E, 13 specs/66 tests), Detox (mobile E2E, `android.attached`, dispositivo físico)

## Decisiones arquitectónicas clave
- Repository pattern `createXxxRepository(client)`
- `ExerciseType` cast obligatorio al mapear Supabase → core
- 1RM Brzycki; PR auto-actualizado vía trigger SQL; RLS `auth.uid()=user_id` en todas las tablas
- `addExerciseToWorkout()` siempre con el UUID real de DB (no ID local) — si no, delete/update rompen vía RLS
- Mobile: `getSession()` en pantallas (no `getUser()`, evita round-trip de red y userId vacío)
- Supersets: `group_id`/`group_name` compartidos en `routine_day_exercises` y `workout_exercises`
- Home Screen Settings (categorías ocultas): client-side (localStorage web / `user_metadata` mobile), sin campo en DB
- Lista completa de decisiones: `.agent/context/architecture.md`

## Estado actual — qué funciona
Fases 0–5 completas, sin gaps funcionales vs. la app de referencia.
- `packages/core` ✅ 203 tests Vitest
- `packages/database` ✅ 8 repositorios, migraciones 001–006, SyncEngine
- `apps/web` ✅ todas las rutas, nav de 6 secciones (igual que mobile), `/search` global, dashboard con franja semanal+racha+drag&drop+multi-select+resumen final, accesibilidad WCAG AA, CSP, CI/CD
- `apps/mobile` ✅ APK release estable (dispositivo `ZY22G9PDSV`), mismas 6 tabs, Detox funcional
- Ambos ✅ fechas en español, colores/tema renderizando correctamente en web

## Bugs corregidos recientemente (no repetirlos)
- **Tailwind v4 sin `@theme`**: `bg-primary`, `text-muted-foreground`, `bg-secondary`, etc. llevaban TODA la historia del proyecto sin generar ninguna regla CSS real — Tailwind v4 no reconoce colores custom sin `@theme`. Arreglado en `apps/web/app/globals.css`. Los tests de Playwright no lo detectaban (comprueban DOM/roles, no colores) → **verificar visualmente con screenshot tras cambios de estilo**, no confiar solo en tests de rol/texto.
- **`formatWorkoutDate` en inglés**: arrays de día/mes hardcodeados en inglés en `packages/core/src/utils/dateUtils.ts` pese a que toda la app es en español — traducido y reordenado a convención española ("día de mes de año").
- **Gradle no detecta cambios en `packages/core`**: `./gradlew assembleRelease` puede marcar `createBundleReleaseJsAndAssets` UP-TO-DATE aunque cambie código del paquete compartido → APK con bundle JS stale. Si se toca `packages/core` y el cambio no aparece en el APK: `cd apps/mobile/android && ./gradlew createBundleReleaseJsAndAssets --rerun-tasks --no-daemon` antes de `assembleRelease`.
- **Detox pisa la build release**: debug y release comparten `applicationId` (`com.fitnotes.app`) — instalar la build debug de Detox para testear sobrescribe la release ya instalada. Reinstalar la release al terminar de testear con Detox.
- **`Alert.alert` en Android**: máximo 3 botones nativos, un 4º se descarta en silencio sin error. Usar `Modal` propio si se necesitan más opciones.
- **`confirm()` nativo → `ConfirmDialog`** en web: specs que esperaban `page.once("dialog", ...)` deben clicar el botón real del `role="alertdialog"` ahora.

## Pendiente / bloqueado
- `packages/ui` vacío, sin spec
- **EAS `projectId`**: placeholder en `app.json`, requiere `eas init` con cuenta Expo real
- Cuenta de test Supabase (`e2e-tests@fitnotes.local`) compartida y frágil — algunos specs asumen que existen/no existen workouts en fechas relativas ("ayer", "hace 3 días"); si un spec falla por datos, revisar el estado de la cuenta antes de asumir bug de código
- Sin gaps funcionales conocidos vs. la app de referencia

## Comandos
```bash
pnpm --filter @fitnotes/web dev
pnpm --filter @fitnotes/mobile start
pnpm --filter @fitnotes/core test
cd apps/web && PLAYWRIGHT_USER_EMAIL=x PLAYWRIGHT_USER_PASSWORD=y npx playwright test
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```
Detox (gotchas de configuración, comandos): ver `.agent/context/apps-mobile.md`.
