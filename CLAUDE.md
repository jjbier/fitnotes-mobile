# FitNotes App — CLAUDE.md

## Objetivo
App de seguimiento de fitness (workout logging, PRs, rutinas, body tracker) con **web** (Next.js 15) y **mobile** (Expo SDK 52) compartiendo lógica via `@fitnotes/core`. Todo en **español**.

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
| Estado | Zustand 5 + Immer | stores en `@fitnotes/core` |
| Backend | Supabase (ref: `fbhjiwtriqrxibqwsyqj`) | Auth + Postgres + RLS |
| Supabase client | `@supabase/supabase-js@^2.108.2` + `@supabase/ssr@^0.12.0` | FIJAS — cambiarlas rompe genéricos |
| Validación | Zod 3 | schemas en `@fitnotes/core/schemas` |
| Drag & drop | `react-native-draggable-flatlist@4.0.3` | NestableScrollContainer + NestableDraggableFlatList |

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
- **Dark mode mobile**: `useTheme()` de `apps/mobile/lib/theme.ts` — sigue esquema del sistema via `useColorScheme()`

---

## Estado actual — qué funciona

### `packages/core` ✅
- Tipos: `Exercise`, `ExerciseType` (10 valores), `Workout`, `Set`, `WorkoutExercise`, `PersonalRecord`, `Routine`, `RoutineDay`, `RoutineDayExercise`, `PredefinedSet`, `BodyMeasurement`, `BodyMeasurementEntry`
- `RoutineDayExercise` tiene `group_id?: string` y `group_name?: string`
- `WorkoutExercise` tiene `group_id?: string` y `group_name?: string`
- Stores: `useWorkoutStore`, `useExerciseStore`, `useProgressStore`, `useRoutineStore`
- Utils: `calculate1RM`, `estimateRepMax`, `calculateVolume`, `calculatePace`, `calculateSpeed`, `roundToNearest`, `calculateSetWeight`, `calculatePlates`, `formatWorkoutDate`, `getWeekRange`, `groupWorkoutsByMonth`
- **144 tests Vitest**

### `packages/database` ✅
- Repositorios: `exercise`, `routine`, `workout`, `progress`, `bodyTracker`, `calendar`, `goals`
- `routineRepository` incluye: `copyRoutine`, `updateRoutine`, `updateDayExercise`, `updateDayGroupName`, `reorderDays`, `reorderExercises`, `getPredefinedSets`, `savePredefinedSets`
- `workoutRepository.addExercise` acepta `group_id` y `group_name`
- Migraciones aplicadas en Supabase: 001–005 (incluye `group_name` en `routine_day_exercises`)
- `SyncEngine` — push/pull/sync

### `apps/web` ✅ — todas las rutas conectadas a Supabase
`/dashboard`, `/exercise`, `/exercise/[id]`, `/progress`, `/calendar`, `/routines`, `/routines/[id]`, `/body-tracker`, `/tools`, `/settings` (incl. export CSV + delete account)

**Web loading/error boundaries** (`loading.tsx` + `error.tsx`) en todas las rutas incluyendo sub-rutas: `exercise/[id]`, `exercise/history/[exerciseId]`, `routines/[id]`, `workout/[date]`.

### `apps/mobile` ✅ — APK release funcionando en dispositivo Android

**Dark mode**: todas las pantallas usan `useTheme()` y siguen el esquema del sistema (light/dark). Tab bar, status bar y modales también adaptan colores.

**Tabs:**
| Tab | Contenido |
|---|---|
| Hoy | workout por fecha, delete ejercicio, navegar a training |
| Calendario | grid mensual, list view |
| Ejercicios | browse + speed dial FAB (crear ejercicio / nueva rutina) |
| Progreso | PRs expandibles, 1RM estimado |
| **Rutinas** | lista rutinas — crear/editar/copiar/eliminar vía menú ⋮ |
| Configuración | perfil, kg/lb, **Herramientas** (→ calculadoras), body tracker, sign-out, delete account |

**Rutas no-tab:**
- `workout/[exerciseId]` — sets CRUD completo, todos los ExerciseTypes, RestTimer haptics
- `routines/[id]` — días + ejercicios, edit mode, drag & drop days+ejercicios, predefined sets, supersets con nombres personalizables, log routine day → workout real
- `calculators` — 1RM, Set%, Plate calculators (accesible desde Configuración)
- `body-tracker` — CRUD medidas + entradas
- `exercises/[categoryId]`
- `search/` — búsqueda global de ejercicios con historial
- `goals/` — objetivos por ejercicio
- `exercise-history/[exerciseId]` — historial completo + gráfico

**Rutinas — características completas:**
- Crear/editar nombre+notas/copiar/eliminar vía menú ⋮
- Días con drag & drop reordenar
- Ejercicios por día con drag & drop reordenar
- Predefined sets por ejercicio (modal, campos vacíos = copian del historial)
- **Supersets con nombres personalizables**: icono 🔗 → agrupa (group_id); tap en morado → Alert: "Renombrar grupo" | "Quitar del grupo" | "Cancelar"
- Log routine day → crea workout real con predefined sets y group_name propagado
- `?create=1` param abre modal de nueva rutina automáticamente

**Config por ejercicio** (migración 003):
- `weight_increment` — usado en botones +/− del workout
- `default_rest_seconds` — inicializa el RestTimer al abrir el ejercicio
- `default_chart` — `"weight" | "volume" | "reps"` (migración 004)

**Accessibility**: `accessibilityLabel` en todos los botones de icono (exercises, index, workout).

### Android APK ✅
```bash
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## Pendiente / descartado

- `shadcn/ui` no inicializado — incompatibilidad `eslint-config-next` + ESLint v9
- `packages/ui` vacío
- SyncEngine pull no actualiza stores de ejercicios/rutinas (solo today workout via `refetchSignal`)
- `routines/index.tsx` es código muerto — el tab usa `(tabs)/tools.tsx` que duplica esa UI
- Phase 7.6 (CI/CD: GitHub Actions, EAS build, Vercel config, README) — no iniciado

---

## Comandos

```bash
pnpm --filter @fitnotes/web dev
pnpm --filter @fitnotes/mobile start
pnpm --filter @fitnotes/core test
cd apps/mobile && npx tsc --noEmit
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```
