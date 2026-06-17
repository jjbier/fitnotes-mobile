# Architecture — FitNotes App

## Monorepo layout

```
fitnotes-app/
├── apps/
│   ├── web/          Next.js 15 App Router — puerto 3000
│   └── mobile/       Expo SDK 52 — Metro bundler
└── packages/
    ├── core/         Lógica pura. SIN react/next/expo.
    ├── database/     Cliente Supabase + tipos + repositorios
    ├── ui/           Tokens (vacío, sin implementar)
    └── tsconfig/     base.json / nextjs.json / expo.json
```

## Flujo de dependencias

```
apps/web  ──┐
            ├──► @fitnotes/core     (zustand, zod, immer)
apps/mobile─┘
            └──► @fitnotes/database (supabase-js, @supabase/ssr)
```

## Decisiones clave

| Decisión | Razón |
|---|---|
| `packages/core` sin deps de plataforma | Mismo store en web y mobile |
| Repository pattern `createXxxRepository(client)` | Desacopla queries del cliente |
| `@supabase/ssr@0.12.0` + `@supabase/supabase-js@2.108.2` pinned | SupabaseClient pasó de 3 a 5 params genéricos — mezclar versiones da `Type '{ Tables }' is not assignable to '"public"'` |
| `ExerciseType` cast `as ExerciseType` | Supabase devuelve string literal union, core usa enum |
| `apps/web/.env.local` (no raíz) | Next.js solo lee env de su propio directorio |
| Trigger SQL para PRs | Consistencia garantizada desde cualquier cliente |
| StyleSheet en mobile (no NativeWind) | NativeWind v4 tiene problemas con Tailwind v4 |
| `verbatimModuleSyntax` → imports con `.js` | Compatibilidad con bundlers |

## Rutas web `apps/web/app/`

```
/                      → redirect
/(auth)/login          → login email+password
/(auth)/register       → registro
/(app)/dashboard       → workout del día, picker ejercicios, sets CRUD
/(app)/workout/[date]  → workout por fecha (existe pero no linkeada desde dashboard)
/(app)/exercise        → catálogo por categorías
/(app)/exercise/[id]   → detalle + historial sets
/(app)/progress        → PRs + Recharts LineChart
/(app)/calendar        → grid mensual con puntos, popup día
/(app)/routines        → lista + crear/copiar/eliminar
/(app)/routines/[id]   → editor: días, ejercicios, sets predefinidos
/(app)/body-tracker    → medidas corporales, log inline
/(app)/tools           → 1RM / Set% / Plate calculators
/(app)/settings        → perfil (auth.updateUser), unidad, sign-out
middleware.ts          → guard server-side → redirect /login
```

## Rutas mobile `apps/mobile/app/`

```
_layout.tsx            → auth guard (getSession + onAuthStateChange)
(auth)/login           → login
(auth)/register        → registro
(tabs)/_layout.tsx     → 6 tabs: index/calendar/exercises/progress/tools/settings
(tabs)/index           → Today — workout por fecha
(tabs)/calendar        → grid mensual, list view
(tabs)/exercises       → catálogo por categorías
(tabs)/progress        → PRs por ejercicio, expandible
(tabs)/tools           → 1RM / Set% / Plate calculators
(tabs)/settings        → perfil, unidad, sign-out (Alert confirm)
workout/[exerciseId]   → modal training fullScreen — sets CRUD todos ExerciseTypes
routines/index         → lista rutinas
routines/[id]          → días + ejercicios, edit mode
exercises/[categoryId] → ejercicios de categoría
```

## Base de datos (Supabase — ref: `fbhjiwtriqrxibqwsyqj`)

Tablas: `categories`, `exercises`, `workouts`, `workout_exercises`, `sets`,
`personal_records`, `routines`, `routine_days`, `routine_day_exercises`,
`predefined_sets`, `body_measurements`, `body_measurement_entries`

- Todas: `user_id uuid references auth.users` + RLS `auth.uid() = user_id`
- Todas: `updated_at` mantenido por trigger
- `personal_records`: auto-update via trigger en `sets` INSERT/UPDATE
- `workouts.date`: string `YYYY-MM-DD` (no timestamp)
- **No existe tabla `goals`** — el goal está en `body_measurements.goal_type/goal_value`
