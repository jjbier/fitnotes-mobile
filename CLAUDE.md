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

---

## Estado actual — qué funciona

### `packages/core` ✅
- Tipos: `Exercise`, `ExerciseType` (5 valores), `Workout`, `Set`, `WorkoutExercise`, `PersonalRecord`, `Routine`, `RoutineDay`, `RoutineDayExercise`, `PredefinedSet`, `BodyMeasurement`, `BodyMeasurementEntry`
- Stores: `useWorkoutStore` (con `removeExerciseFromWorkout`, `removeWorkoutFromHistory`), `useExerciseStore`, `useProgressStore`, `useRoutineStore`
- Utils: `calculate1RM`, `estimateRepMax`, `calculateVolume`, `calculatePace`, `calculateSpeed`, `roundToNearest`, `calculateSetWeight`, `calculatePlates`, `formatWorkoutDate`, `getWeekRange`, `groupWorkoutsByMonth`
- **144 tests Vitest** — incluye CRUD tests para los 5 ExerciseTypes (WEIGHT_REPS, DISTANCE_TIME, REPS_ONLY, WEIGHT_ONLY, TIME_ONLY)

### `packages/database` ✅
- `createBrowserClient()` / `createServerClient()` tipados con `Database`
- `types.ts` generado con `supabase gen types typescript`
- Repositorios: `exercise`, `routine`, `workout`, `progress`, `bodyTracker`, `calendar`
- `SyncEngine` — push/pull/sync

### `apps/web` ✅ — todas las rutas conectadas a Supabase
`/dashboard`, `/exercise`, `/exercise/[id]`, `/progress`, `/calendar`, `/routines`, `/routines/[id]`, `/body-tracker`, `/tools`, `/settings` (incl. export CSV + delete account)

### `apps/mobile` ✅ — APK release funcionando en dispositivo Android
- **Hoy**: workout por fecha, delete ejercicio del workout ✅, navegar a training
- **Training** (`workout/[exerciseId]`): sets CRUD completo ✅ (add/edit/delete), delete ejercicio ✅, RestTimer con haptics, todos los ExerciseTypes
- **Ejercicios**: browse + FAB crear ejercicio + categoría inline
- **Progreso**: PRs expandibles, 1RM estimado
- **Herramientas**: 1RM, Set%, Plate calculators
- **Configuración**: perfil, kg/lb (user_metadata), sign-out, delete account
- **Rutinas**: lista/crear/eliminar/copiar, días + ejercicios, log routine day → crea workout real; predefined sets por ejercicio; drag & drop reordenar days y ejercicios; supersets (group_id)
- **Body Tracker**: CRUD medidas + entradas, accesible desde Settings
- **Calendario**: grid mensual, list view
- **Sesión persistente**: FileStorage adapter, auto-refresh indefinido
- **Sync**: AppState listener, `refetchSignal` actualiza workout de hoy al volver del background

### Android APK ✅
- `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- `cd apps/mobile/android && ./gradlew assembleRelease --no-daemon`
- `adb install <path>`

---

## Pendiente / descartado

- `shadcn/ui` no inicializado — incompatibilidad `eslint-config-next` + ESLint v9
- `packages/ui` vacío
- SyncEngine pull no actualiza stores de ejercicios/rutinas (solo today workout via `refetchSignal`)

---

## Comandos

```bash
pnpm --filter @fitnotes/web dev
pnpm --filter @fitnotes/mobile start
pnpm --filter @fitnotes/core test
cd apps/mobile && npx tsc --noEmit
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
adb install apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```
