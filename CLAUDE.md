# FitNotes App — CLAUDE.md

## Objetivo
App de seguimiento de fitness (workout logging, PRs, rutinas, body tracker, calculadoras) con **web** (Next.js 15) y **mobile** (Expo SDK 52) compartiendo lógica via `@fitnotes/core`. Todo en **español**. Paridad de features con la app de referencia FitNotes — ver `docs/implementation-plan-2026-07.md` (Fases 0–5, **completas**).

---

## Arquitectura

```
fitnotes-app/
├── apps/web          → Next.js 15 App Router  (puerto 3000)
├── apps/mobile       → Expo SDK 52 + Expo Router v4
└── packages/
    ├── core          → @fitnotes/core  — ZERO imports react/next/expo
    ├── database      → @fitnotes/database (Supabase client + repositorios)
    ├── ui            → vacío
    └── tsconfig      → configs TS base/nextjs/expo
```

**Regla crítica:** `packages/core` nunca importa `react`, `next` ni `expo`.

---

## Stack & versiones clave

| Capa | Tecnología | Nota |
|---|---|---|
| Monorepo | Turborepo 2 + pnpm workspaces | `.npmrc` con `public-hoist-pattern` para Babel |
| Lenguaje | TypeScript strict, `verbatimModuleSyntax` | imports internos con `.js` |
| Web | Next.js 15, Tailwind v4 | shadcn/ui NO inicializado |
| Mobile | Expo 52, Expo Router v4 | StyleSheet only, NO NativeWind en componentes |
| Estado | Zustand 5 + Immer | stores en `@fitnotes/core`; `useThemeModeStore` en mobile (fuera de core) |
| Backend | Supabase (ref: `fbhjiwtriqrxibqwsyqj`) | Auth + Postgres + RLS |
| Supabase client | `@supabase/supabase-js@^2.108.2` + `@supabase/ssr@^0.12.0` | FIJAS — cambiarlas rompe genéricos |
| Validación | Zod 3 | schemas en `@fitnotes/core/schemas` |
| Drag & drop | `react-native-draggable-flatlist@4.0.3` | NestableScrollContainer + NestableDraggableFlatList |
| Virtualización web | `@tanstack/react-virtual@3.14.4` | `useWindowVirtualizer` en listas de ejercicios |
| Audio mobile | `expo-av@~15.0.2` | sonido del rest timer |
| Compartir/imagen mobile | `expo-sharing@~13.0.1` + `react-native-view-shot@~4.0.3` | exportar imagen de gráficos |
| Iconos web | `lucide-react` | usado en `WorkoutTimer` (play/pause) |
| Tests web E2E | Playwright | 3 proyectos: setup, chromium, chromium-auth |

---

## Decisiones arquitectónicas

- **Repository pattern**: `createXxxRepository(client)` en `packages/database/src/repositories/`
- **`ExerciseType` cast**: `ex.type as ExerciseType` obligatorio al mapear filas Supabase → core
- **`.env.local`**: en `apps/web/.env.local` (no raíz). Mobile: `EXPO_PUBLIC_*` en `apps/mobile/.env`
- **IDs locales**: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
- **1RM**: Brzycki → `weight * (36 / (37 - reps))`, guard en reps ≥ 37
- **PR**: auto-actualizado via trigger SQL en `public.sets`
- **RLS**: todas las tablas `auth.uid() = user_id` (FOR ALL)
- **Mobile auth**: `getSession()` en todas las pantallas (rápido, sin red). Solo `_layout.tsx` usa `onAuthStateChange`
- **Mobile session**: `FileStorage` (expo-file-system) como Supabase auth storage — NO AsyncStorage (incompatible con RN 0.76)
- **workout_exercise ID**: siempre pasar `data.id` (UUID real de DB) a `addExerciseToWorkout()` — el ID local rompía delete/update vía RLS
- **NativeWind v4**: `withNativeWind` en metro.config.js + `jsxImportSource: "nativewind"` en babel. NO `nativewind/babel` plugin
- **Metro TS resolver**: mapea `.js` → `.ts` para workspace packages con `verbatimModuleSyntax`
- **pnpm hoisting**: `.npmrc` `public-hoist-pattern[]=@babel/runtime*` — necesario para `assembleRelease`
- **Supersets**: `group_id` en `routine_day_exercises` — tap icono 🔗 agrupa con siguiente ejercicio, tap morado abre Alert (renombrar/disolver)
- **Predefined sets race condition fix**: `useRef` para trackear qué ejercicio está cargando — descartar respuesta si el usuario cambió de ejercicio
- **Dark mode mobile**: `useTheme()` de `apps/mobile/lib/theme.ts` — modo `light|dark|system` en `useThemeModeStore` (zustand), inicializado desde `user_metadata.theme_preference` en `_layout.tsx`, override manual en Ajustes
- **Optimistic updates web**: store update → async persist → rollback en error; temp IDs para creates con `opacity-60`
- **Virtualización web**: `useWindowVirtualizer` con `scrollMargin: listRef.current?.offsetTop ?? 0`; dropdown fijo via `getBoundingClientRect()` + scroll listener para cerrar
- **Accessibility web**: focus trap `lib/useFocusTrap.ts`, skip link `#main-content`, `role="dialog/tablist/tab"`, `aria-current="page"`, `lang="es"`, per-route `layout.tsx` para metadata en client components
- **CSP**: `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src ... *.supabase.co ... accounts.google.com`
- **SyncEngine targeted updates**: `changedTables: Set<string>` en `SyncResult` — `_layout.tsx` recarga ejercicios/rutinas en stores directamente; workout tables incrementan `refetchSignal`
- **Rest timer**: arranque solo manual. Fin de tiempo → `Vibration.vibrate([0,400,150,400,150,400])` + haptics + **sonido opcional** (`expo-av`, toggle + volumen 0-100 en Ajustes, `assets/sounds/timer-end.mp3`). Recuerda última duración usada vía `last-timer-duration.json` (expo-file-system). Sin push notifications
- **exercise_type enum en DB**: valores UPPERCASE (`WEIGHT_REPS`, `REPS_ONLY`, `DISTANCE_TIME`, `WEIGHT_ONLY`, `TIME_ONLY`)
- **Backup/restore compartido**: `createBackupRepository` en `@fitnotes/database` (export/restore JSON + recalcular PRs) — mobile sin document-picker/file-system nativo: export vía `Share.share`, restore vía modal de pegado (mismo patrón que import CSV)
- **Eliminar historial con filtros**: `workoutRepository.deleteWorkoutHistory(userId, {dateFrom, dateTo, exerciseId})` — si se filtra por ejercicio, borra solo esos `workout_exercises` y limpia workouts que quedan vacíos
- **Home Screen Settings (categorías ocultas)**: lista de IDs client-side, sin campo en DB — `localStorage` (web, `SETTING_KEYS.HIDDEN_CATEGORIES`) / `user_metadata.hidden_category_ids` (mobile)
- **Google Drive backup**: rotación automática tras cada subida, mantiene solo los últimos 5 archivos `fitnotes-backup-*`
- **`body_measurements.order_index`**: reorden drag&drop en ambas plataformas (migración 006)

---

## Estado actual — qué funciona

**Todas las Fases 0–5 del plan de paridad con FitNotes están completas**, incluyendo los ítems inicialmente diferidos (ver `docs/implementation-plan-2026-07.md`). No hay gaps conocidos vs. la app de referencia.

### `packages/core` ✅
- Tipos: `Exercise`, `ExerciseType` (10 valores), `Workout`, `Set`, `WorkoutExercise`, `PersonalRecord`, `Routine`, `RoutineDay`, `RoutineDayExercise`, `PredefinedSet`, `BodyMeasurement`, `BodyMeasurementEntry`
- `RoutineDayExercise` y `WorkoutExercise` tienen `group_id?` y `group_name?` (supersets)
- Stores: `useWorkoutStore`, `useExerciseStore`, `useProgressStore`, `useRoutineStore`
- Utils: `calculate1RM`, `estimateRepMax`, `calculateVolume`, `calculatePace`, `calculateSpeed`, `roundToNearest`, `calculateSetWeight`, `calculatePlates`, `formatWorkoutDate`, `getWeekRange`, `groupWorkoutsByMonth`, `getExerciseFields`
- **203 tests Vitest**

### `packages/database` ✅
- Repositorios: `exercise`, `routine`, `workout`, `progress`, `bodyTracker`, `calendar`, `goals`, **`backup`** (nuevo: export/restore/recalculatePersonalRecords)
- `ChartPoint` extendido: `totalReps`, `totalDistance`, `totalTime`, `maxSpeed`, `bestPace`, `weightByReps` (duplicado en `packages/core/src/stores/progressStore.ts` — mantener sincronizados)
- `workoutRepository`: `deleteWorkoutHistory` (filtros fecha/ejercicio), `exportAllCSV`
- `bodyTrackerRepository`: `exportAllCSV`, `reorderMeasurements`, `seedDefaultMeasurementsIfNeeded`
- `calendarRepository`: `getWorkoutHistoryDetailed`, `getWorkoutSetDetail`, `getWorkoutDatesForExerciseWithConditions`
- Migraciones aplicadas en Supabase: 001–006 (incluye `group_name`, `order_index` en `body_measurements`)
- Tabla `exercise_goals` existe en DB (goals por ejercicio)
- `SyncEngine` — push/pull/sync con `changedTables` propagado correctamente

### `apps/web` ✅ — todas las rutas conectadas a Supabase, estructura de navegación igualada a mobile
`/dashboard`, `/exercise`, `/exercise/[id]`, `/exercise/history/[exerciseId]`, `/search`, `/progress`, `/calendar`, `/routines`, `/routines/[id]`, `/body-tracker`, `/body-tracker/settings`, `/tools`, `/settings`, `/workout/[date]`

- **Sidebar (desktop) y MobileNav (móvil web)**: 6 secciones, idénticas a las tabs de mobile (Hoy/Calendario/Ejercicios/Progreso/Rutinas/Configuración) — `/body-tracker` y `/tools` YA NO son ítems de nav de primer nivel, se acceden desde secciones dedicadas dentro de Configuración ("Herramientas"/"Salud"), igual que en mobile
- **`/search`** (nuevo, 2026-07-01): búsqueda global de ejercicios ordenados por entrenados-recientemente primero, con resumen de última sesión (fecha, nº series, peso/reps máx.) — accesible desde el icono de historial en `/exercise`, paridad con `search/index.tsx` de mobile
- **Dashboard**: timer con pausa/reanudar manual (`WorkoutTimer.tsx`), contador de series opcional (Home Screen Settings)
- **Body Tracker**: click en punto de gráfica → medidas relacionadas de esa fecha; goal_value, drag&drop, CSV export
- **Calendario**: toggles panel inferior / puntos de categoría vs. círculo, filtros avanzados, list view con detalle expandible
- **Progreso**: `ExerciseOverview` (panel lateral) con tabs Récords/Gráfica/Historial/Estadísticas/Objetivo — la gráfica (`ProgressChart.tsx`) ya tenía export a PNG (SVG→canvas, botón "Exportar") antes de esta revisión, equivalente a "compartir imagen" de mobile
- **Tools**: 1RM + Set% (con "Add to Workout" y PRSelector) + Plate calculator configurable + RestTimer SVG
- **Settings**: perfil, toggles, recalcular PRs, backup/restore `.fitnotes`, CSV, Google Drive (con rotación), eliminar historial con filtros, Home Screen Settings (contador series + categorías visibles), secciones Herramientas/Salud (enlaces a /tools y /body-tracker)
- **Accesibilidad WCAG AA**, **CSP headers**, **CI/CD** (GitHub Actions + dependabot), **E2E Playwright** (13 specs, 66 tests)

### `apps/mobile` ✅ — APK release, feature parity con web

**Tabs:** Hoy, Calendario, Ejercicios, Progreso, Rutinas, Configuración

- **Hoy**: drag&drop reorder de ejercicios, multi-select para borrar varios, timer manual con pausa/reanudar
- **Calendario**: mismos toggles y filtros que web
- **Body Tracker**: tap en gráfica → medidas relacionadas; export CSV
- **Calculadoras**: Set Calculator con "Add to Workout" + "Select Max" (PRs); Plate Calculator configurable
- **Ajustes**: selector de tema claro/oscuro/sistema, backup/restore completo, recalcular PRs, sonido/volumen del rest timer, Home Screen Settings
- **Rutas nuevas**: `workout-detail/[workoutId]` (detalle completo de un workout por fecha), `exercise-history/[exerciseId]` con export de imagen del gráfico (`react-native-view-shot` + `expo-sharing`)
- **Sync cross-device**: `refetchSignal` + actualización directa de stores vía `changedTables`

### Android APK ✅
```bash
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```
Última build (2026-07-01) incluye `expo-av`/`expo-sharing`/`react-native-view-shot` + **icono de app nuevo** (checklist: clipboard blanco con 3 checkboxes marcados sobre fondo indigo `#6366f1`) — instalada correctamente en dispositivo `ZY22G9PDSV`.

**Icono de app**: generado con Pillow (`apps/mobile/assets/images/icon.png` + `adaptive-icon.png` + `splash.png` + `favicon.png`, 1024×1024 salvo favicon 48×48). Como `android/` está gitignorado y ya prebuildeado, un cambio de icono en `assets/images/` **no** se aplica solo con `gradlew assembleRelease` — hay que regenerar a mano los `mipmap-*/ic_launcher*.webp` en `android/app/src/main/res/` (legacy 48-192px desde `icon.png`, `ic_launcher_round.webp` con máscara circular, `ic_launcher_foreground.webp` 108-432px desde `adaptive-icon.png` transparente) antes de compilar. Si se hace un `expo prebuild` limpio en el futuro, ya tomará los assets fuente automáticamente.

### Datos en Supabase ✅
30 ejercicios creados: 6 por cada categoría (Tren Inferior, Pecho, Espalda, Hombros, Brazos).

---

## Pendiente / descartado

- `shadcn/ui` no inicializado — incompatibilidad `eslint-config-next` + ESLint v9
- `packages/ui` vacío
- **EAS `projectId`**: `app.json` tiene placeholder — requiere `eas init` con cuenta Expo real
- **E2E tests (web)**: se saltan si no hay `PLAYWRIGHT_USER_EMAIL` + `PLAYWRIGHT_USER_PASSWORD`
- **Detox (mobile)**: configurado y funcional (10 tests: smoke/navigation/interactions) — ver sección "E2E mobile (Detox)" abajo
- Sin gaps funcionales conocidos vs. la app de referencia FitNotes (ver `docs/implementation-plan-2026-07.md`)

---

## E2E mobile (Detox) — 2026-07-01

Configurado sobre el dispositivo Android físico conectado (`android.attached`, sin emulador/AVD). 10 tests en 3 specs: `e2e/smoke.test.js`, `e2e/navigation.test.js` (las 6 tabs), `e2e/interactions.test.js` (búsqueda de ejercicios, toggle de settings).

**Gotchas encontrados al configurarlo** (útiles si hay que tocar esto de nuevo):
- Detox publica sus artefactos Android en un **repo Maven local dentro del propio paquete npm** (`node_modules/detox/Detox-android`), NO en Maven Central (que solo tiene versiones antiguas `com.wix:detox<=0.1.1` sin relación). Hay que añadir ese path como `maven { url ... }` en `android/build.gradle` (`allprojects.repositories`) — si no, Gradle intenta resolverlo vía JitPack/sonatype y falla con timeouts confusos.
- `jest`/`jest-circus`/`jest-mock` deben quedar en la MISMA major version (usamos `29.7.0` fijo) — pnpm puede acabar con dos copias de `jest-mock` si se instalan en momentos distintos, dando `TypeError: clearMocksOnScope is not a function`.
- El build debug necesita **Metro corriendo** (`npx expo start`) antes de `detox test` — si no, la app tarda >45s en arrancar (o nunca conecta) porque intenta cargar el bundle JS de un Metro inexistente.
- El diálogo nativo de Android "¿Guardar contraseña en Google?" (autofill) roba el foco de ventana y rompe Espresso tras el primer login. Hay que desactivar el autofill service del dispositivo durante los tests: `adb shell settings put secure autofill_service null` (restaurar después con el valor original, típicamente `com.google.android.gms/com.google.android.gms.autofill.service.AutofillService`).
- `android/app/build.gradle`: añadido `testInstrumentationRunner`, `testBuildType`, y `androidTestImplementation('com.wix:detox:20.51.4')` (versión pineada, no `+`). Runner custom en `android/app/src/androidTest/java/com/fitnotes/app/DetoxTest.java`.
- Se añadieron `testID`s puntuales donde no había ninguno: `login-email-input`, `login-password-input`, `login-submit-button`, `exercises-search-input`.

```bash
cd apps/mobile && npx expo start &                      # Metro debe estar corriendo
npx detox test --configuration android.att.debug         # todos los specs
npx detox test --configuration android.att.debug e2e/navigation.test.js
```

---

## Comandos

```bash
pnpm --filter @fitnotes/web dev
pnpm --filter @fitnotes/mobile start
pnpm --filter @fitnotes/core test
cd apps/mobile && npx tsc --noEmit
cd apps/web && PLAYWRIGHT_USER_EMAIL=x PLAYWRIGHT_USER_PASSWORD=y npx playwright test
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```
