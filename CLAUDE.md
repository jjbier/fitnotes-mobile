# FitNotes App — CLAUDE.md

## Objetivo
App de seguimiento de fitness (workout logging, PRs, rutinas, body tracker) con **web** (Next.js) y **mobile** (Expo) compartiendo toda la lógica de negocio via `@fitnotes/core`.

---

## Arquitectura

```
fitnotes-app/
├── apps/web          → Next.js 15 App Router
├── apps/mobile       → Expo SDK 52 + Expo Router v4
└── packages/
    ├── core          → @fitnotes/core  (ZERO imports de react/next/expo)
    ├── database      → @fitnotes/database (Supabase client + migrations)
    ├── ui            → @fitnotes/ui (tokens compartidos)
    └── tsconfig      → configs TS base/nextjs/expo
```

**Regla crítica:** `packages/core` nunca debe importar `react`, `next` ni `expo`. Es el contrato de platform-agnosticism.

---

## Stack

| Capa | Tecnología |
|---|---|
| Monorepo | Turborepo 2 + pnpm workspaces |
| Lenguaje | TypeScript strict (`verbatimModuleSyntax`) |
| Web | Next.js 15, Tailwind v4, shadcn/ui (Radix), Recharts |
| Mobile | Expo 52, Expo Router v4, NativeWind v4 |
| Estado | Zustand 5 + Immer (stores en `@fitnotes/core`) |
| Backend | Supabase (Auth + Postgres + RLS) |
| Validación | Zod 3 (schemas en `@fitnotes/core/schemas`) |
| Mobile DB | expo-sqlite (offline-first, pendiente implementar) |

---

## Convenciones clave

- Imports internos usan extensión `.js` (TS bundler mode con `verbatimModuleSyntax`)
- IDs generados localmente con `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` hasta conectar Supabase
- Fórmula 1RM: Brzycki → `weight * (36 / (37 - reps))`; guard en reps ≥ 37
- RLS en todas las tablas: `auth.uid() = user_id`
- PR se actualiza vía trigger SQL en `public.sets` (insert/update)

---

## Estado actual — qué funciona

### `packages/core` ✅ completo
- Tipos: `Exercise`, `ExerciseType`, `Workout`, `Set`, `WorkoutExercise`, `PersonalRecord`, `Routine`, `RoutineDay`, `BodyMeasurement`, `BodyMeasurementEntry` + enums
- Stores: `useWorkoutStore`, `useExerciseStore`, `useProgressStore`, `useRoutineStore`
- Utils: `calculate1RM`, `estimateRepMax`, `calculateVolume`, `calculatePace`, `calculateSpeed`, `formatWorkoutDate`, `getWeekRange`, `groupWorkoutsByMonth`
- Schemas Zod para todos los tipos + variantes de form input

### `packages/database` ✅ estructura completa, lógica pendiente
- `createBrowserClient` / `createServerClient` (tipados con `Database`)
- Migration SQL completa: 10 tablas, RLS, índices, triggers `updated_at`, trigger auto-PR
- `SyncEngine` clase con métodos vacíos (tipos definidos, implementación pendiente)
- `types.ts` placeholder (requiere `supabase gen types`)

### `apps/web` ✅ scaffold completo
- 13 páginas con layout App Router, rutas correctas, import de stores
- Componentes stub con props interfaces: `TrainingScreen`, `SetList`, `SetForm`, `NavigationPanel`, `ProgressChart`, `PersonalRecords`, `Sidebar`, `MobileNav`
- `SetForm` tiene lógica real: renderiza campos según `ExerciseType`

### `apps/mobile` ✅ scaffold completo
- 11 pantallas con `SafeAreaView + ScrollView`, iconos Ionicons, imports de stores
- Componentes: `SetRow` (funcional), `RestTimer` (temporizador funcional con +/-30s), `Button`, `Input`
- Metro config configurado para resolver paquetes del monorepo
- NativeWind + babel configurados

### Infraestructura ✅
- `pnpm install` OK — 993 paquetes, workspace links verificados
- Turbo pipelines: build / dev / lint / type-check

---

## Pendiente / bugs conocidos

### Crítico (nada funciona sin esto)
- [ ] **Supabase no está conectado** — todas las páginas usan datos placeholder
- [ ] **Auth no implementada** — no hay middleware de sesión en web, ni guard en mobile `_layout.tsx`
- [ ] `packages/database/src/supabase/types.ts` es placeholder → ejecutar `supabase gen types typescript`

### Web
- [ ] `Sidebar.tsx` y `MobileNav.tsx` necesitan `"use client"` + `usePathname()` para active state
- [ ] Ningún page tiene fetching real de datos (Supabase queries)
- [ ] `ProgressChart.tsx` — implementar con Recharts `<LineChart>` (stub marcado)
- [ ] Auth layout `(auth)` no tiene middleware server-side que verifique sesión

### Mobile
- [ ] `metro.config.js` usa `withNativeWind` — verificar compatibilidad cuando se instale `nativewind/metro`
- [ ] `RestTimer` no tiene haptics ni sonido (requiere `expo-haptics`)
- [ ] `SetForm` no existe en mobile — la lógica de input está inline en `workout/[exerciseId].tsx`
- [ ] `expo-sqlite` no tiene schema inicializado ni `pending_changes` table para sync

### `packages/core`
- [ ] Stores no persisten a Supabase ni a SQLite — son solo en memoria
- [ ] `routineStore.logRoutineWorkout()` vacío — falta dispatch a `workoutStore`

### Infraestructura
- [ ] No hay tests (ni unit ni e2e)
- [ ] No hay ESLint config en ningún paquete
- [ ] `shadcn/ui` no está inicializado (no existe `components.json`)
