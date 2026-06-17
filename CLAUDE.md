# FitNotes App — CLAUDE.md

## Objetivo
App de seguimiento de fitness (workout logging, PRs, rutinas, body tracker) con **web** (Next.js 15) y **mobile** (Expo SDK 52) compartiendo lógica de negocio via `@fitnotes/core`.

---

## Arquitectura

```
fitnotes-app/
├── apps/web          → Next.js 15 App Router  (puerto 3000)
├── apps/mobile       → Expo SDK 52 + Expo Router v4
└── packages/
    ├── core          → @fitnotes/core  — ZERO imports react/next/expo
    ├── database      → @fitnotes/database (Supabase client + repositorios)
    ├── ui            → @fitnotes/ui (tokens, sin implementar)
    └── tsconfig      → configs TS base/nextjs/expo
```

**Regla crítica:** `packages/core` nunca importa `react`, `next` ni `expo`.

---

## Stack & versiones clave

| Capa | Tecnología | Nota |
|---|---|---|
| Monorepo | Turborepo 2 + pnpm workspaces | |
| Lenguaje | TypeScript strict, `verbatimModuleSyntax` | imports internos con `.js` |
| Web | Next.js 15, Tailwind v4 | shadcn/ui NO inicializado |
| Mobile | Expo 52, Expo Router v4 | StyleSheet only, NO NativeWind en componentes |
| Estado | Zustand 5 + Immer | stores en `@fitnotes/core` |
| Backend | Supabase (ref: `fbhjiwtriqrxibqwsyqj`) | Auth + Postgres + RLS |
| Supabase client | `@supabase/supabase-js@^2.108.2` + `@supabase/ssr@^0.12.0` | FIJAS — cambiarlas rompe genéricos |
| Validación | Zod 3 | schemas en `@fitnotes/core/schemas` |

---

## Decisiones arquitectónicas

- **Repository pattern**: `createXxxRepository(client: SupabaseClient<Database>)` en `packages/database/src/repositories/`
- **`ExerciseType` cast**: Supabase devuelve string literal union, core usa enum → `ex.type as ExerciseType` obligatorio al mapear filas
- **`.env.local`**: en `apps/web/.env.local` (no raíz monorepo) — Next.js solo lee su propio directorio
- **IDs locales**: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
- **1RM**: Brzycki → `weight * (36 / (37 - reps))`, guard en reps ≥ 37
- **PR**: actualizado via trigger SQL en `public.sets` (insert/update)
- **RLS**: todas las tablas tienen `auth.uid() = user_id`
- **Web auth guard**: `apps/web/middleware.ts` redirige a `/login` si no hay sesión
- **Mobile auth guard**: `apps/mobile/app/_layout.tsx` — `getSession()` + `onAuthStateChange`

---

## Estado actual — qué funciona

### `packages/core` ✅
- Tipos: `Exercise`, `ExerciseType`, `Workout`, `Set`, `WorkoutExercise`, `PersonalRecord`, `Routine`, `RoutineDay`, `RoutineDayExercise`, `PredefinedSet`, `BodyMeasurement`, `BodyMeasurementEntry`
- Stores: `useWorkoutStore`, `useExerciseStore`, `useProgressStore`, `useRoutineStore` (todos con `isLoading` + `error`)
- Utils: `calculate1RM`, `estimateRepMax`, `calculateVolume`, `calculatePace`, `calculateSpeed`, `roundToNearest`, `calculateSetWeight`, `calculatePlates`, `formatWorkoutDate`, `getWeekRange`, `groupWorkoutsByMonth`
- Schemas Zod para todos los tipos

### `packages/database` ✅
- `createBrowserClient()` / `createServerClient()` tipados con `Database`
- `types.ts` generado con `supabase gen types typescript` (no placeholder)
- Repositorios: `exercise`, `routine`, `workout`, `progress`, `bodyTracker`, `calendar`
- `SyncEngine` — clase con métodos vacíos (pendiente)

### `apps/web` ✅ conectado a Supabase

| Ruta | Estado |
|---|---|
| `/login`, `/register` | Auth completo |
| `/dashboard` | Workout logging por fecha, picker ejercicios, sets CRUD |
| `/calendar` | Grid mensual, vista lista, popup día |
| `/exercise` | Lista por categorías, crear/editar ejercicio |
| `/exercise/[id]` | Historial sets del ejercicio |
| `/progress` | Selector ejercicio, tabs Records/Chart/History, Recharts LineChart |
| `/routines` | Lista, crear/copiar/eliminar |
| `/routines/[id]` | Días, ejercicios, sets predefinidos |
| `/body-tracker` | Grid medidas, log inline, historial |
| `/tools` | 1RM Calculator, Set Calculator, Plate Calculator |
| `/settings` | Perfil (auth.updateUser), unidad peso, sign-out |

- Middleware server-side protege todas las rutas
- Sidebar + MobileNav con todas las rutas (active state via `usePathname`)

### `apps/mobile` ✅ conectado a Supabase

| Pantalla | Estado |
|---|---|
| `(auth)/login`, `/register` | Auth completo |
| `(tabs)/index` | Today — workout por fecha, navegar a training |
| `(tabs)/calendar` | Grid mensual, list view |
| `(tabs)/exercises` | Lista por categorías |
| `exercises/[categoryId]` | Ejercicios de categoría |
| `(tabs)/progress` | PRs por ejercicio, expandible |
| `(tabs)/tools` | 1RM, Set%, Plate calculators |
| `(tabs)/settings` | Perfil, unidad, sign-out con Alert |
| `workout/[exerciseId]` | Sets CRUD completo, todos los ExerciseTypes |
| `routines/index` | Lista, crear, eliminar |
| `routines/[id]` | Días + ejercicios, edit mode |

- 6 tabs: Today / Calendar / Exercises / Progress / Tools / Settings
- StyleSheet en todos los componentes (no `className`)

---

## Pendiente / bugs conocidos

### Crítico
- [ ] `SyncEngine` vacío — offline-first mobile no implementado (`expo-sqlite` sin schema)
- [ ] `routineStore.logRoutineWorkout()` vacío — no hace dispatch a `workoutStore`

### Web
- [ ] Delete account en settings es solo UI — falta llamada real a Supabase
- [ ] `/workout/[date]` existe pero no está vinculada desde dashboard

### Mobile
- [ ] Body tracker mobile básico — sin CRUD completo de medidas
- [ ] `RestTimer` sin haptics/sonido (`expo-haptics` no instalado)
- [ ] Unidad kg/lb guardada en estado pero no propagada a inputs de sets

### Infraestructura
- [ ] No hay tests (ni unit ni e2e)
- [ ] No hay ESLint config en ningún paquete
- [ ] `shadcn/ui` no inicializado (`components.json` no existe) — web usa Tailwind directo
- [ ] `packages/ui` vacío

---

## Comandos

```bash
pnpm --filter @fitnotes/web dev              # dev web
pnpm --filter @fitnotes/mobile start         # dev mobile (Expo)
pnpm --filter @fitnotes/core exec tsc --noEmit
pnpm --filter @fitnotes/web exec tsc --noEmit
cd apps/mobile && npx tsc --noEmit
```
