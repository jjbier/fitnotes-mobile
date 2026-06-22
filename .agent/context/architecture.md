# Architecture — FitNotes App

_Last updated: 2026-06-22_

## Monorepo layout

```
fitnotes-app/
├── .npmrc                  public-hoist-pattern para Babel (requerido para Android build)
├── apps/
│   ├── web/                Next.js 15 App Router — puerto 3000
│   └── mobile/             Expo SDK 52 — Metro bundler
└── packages/
    ├── core/               Lógica pura. SIN react/next/expo.
    ├── database/           Cliente Supabase + tipos generados + repositorios
    ├── ui/                 Vacío
    └── tsconfig/           base.json / nextjs.json / expo.json
```

## Decisiones clave

| Decisión | Razón |
|---|---|
| `packages/core` sin deps de plataforma | Mismo store en web y mobile |
| Repository pattern `createXxxRepository(client)` | Desacopla queries del cliente Supabase |
| `@supabase/ssr@0.12.0` + `@supabase/supabase-js@2.108.2` pinned | Mezclar versiones rompe genéricos de SupabaseClient |
| `ExerciseType` cast `as ExerciseType` | Supabase devuelve string, core usa enum |
| `apps/web/.env.local` (no raíz) | Next.js solo lee env de su propio directorio |
| Trigger SQL para PRs | Consistencia garantizada desde cualquier cliente |
| StyleSheet en mobile (no NativeWind en componentes) | NativeWind v4 solo como transformer Metro |
| `verbatimModuleSyntax` → imports con `.js` | Compatibilidad con bundlers ESM |
| `.npmrc` `public-hoist-pattern` Babel | Android `assembleRelease` necesita Babel packages hoisted |
| Metro `resolveRequest` custom | Mapea `.js` → `.ts` para workspace packages |
| NO `nativewind/babel` plugin | Rompe Metro bundler en producción con NativeWind v4 |
| `expo-sqlite` eliminado de plugins | Causaba ERR_MODULE_NOT_FOUND en startup |
| `android.kotlinVersion=1.9.24` | Compose Compiler 1.5.14 compat con Kotlin 1.9.24 |
| `getSession()` en pantallas mobile (no `getUser()`) | `getUser()` hace round-trip de red — causa race condition con `userId` vacío en `addExerciseToWorkout` |
| `addExerciseToWorkout(exerciseId, data.id)` pasa UUID real de DB | ID local rompía delete/update: FK en DB no coincidía con ID local en store |
| FileStorage (expo-file-system) como Supabase auth storage | AsyncStorage v1.x tiene NativeModules null en RN 0.76; v3.x requiere Kotlin 2.x |

## Rutas web `apps/web/app/`

```
/                      → redirect /dashboard
/(auth)/login          → login email+password
/(auth)/register       → registro
/(app)/dashboard       → workout del día
/(app)/exercise        → catálogo + crear ejercicio + categoría inline
/(app)/exercise/[id]   → detalle + historial sets
/(app)/progress        → PRs + Recharts LineChart
/(app)/calendar        → grid mensual, popup día
/(app)/routines        → lista + crear/copiar/eliminar
/(app)/routines/[id]   → editor: días, ejercicios, sets predefinidos
/(app)/body-tracker    → medidas corporales
/(app)/tools           → 1RM / Set% / Plate calculators
/(app)/settings        → perfil, unidad, export CSV, sign-out, delete account
middleware.ts          → guard server-side → redirect /login
```

## Rutas mobile `apps/mobile/app/`

```
_layout.tsx            → auth guard (getSession + onAuthStateChange) + AppState sync + SyncContext
(auth)/login           → login
(auth)/register        → registro
(tabs)/_layout.tsx     → 6 tabs
(tabs)/index           → Hoy — workout por fecha, delete ejercicio
(tabs)/calendar        → grid mensual, list view
(tabs)/exercises       → catálogo + FAB modal crear ejercicio
(tabs)/progress        → PRs expandibles + 1RM
(tabs)/tools           → calculadoras
(tabs)/settings        → perfil, unidad, sign-out, delete account
workout/[exerciseId]   → training fullScreen — sets CRUD + delete ejercicio
routines/index         → lista rutinas
routines/[id]          → días + ejercicios, edit mode, log routine day
exercises/[categoryId] → ejercicios de categoría
body-tracker/index     → CRUD medidas + entradas
```

## Base de datos (Supabase — ref: `fbhjiwtriqrxibqwsyqj`)

Tablas: `categories`, `exercises`, `workouts`, `workout_exercises`, `sets`,
`personal_records`, `routines`, `routine_days`, `routine_day_exercises`,
`predefined_sets`, `body_measurements`, `body_measurement_entries`

- Todas: `user_id uuid references auth.users` + RLS `auth.uid() = user_id` (FOR ALL)
- Todas: `updated_at` mantenido por trigger
- `personal_records`: auto-update via trigger en `sets` INSERT/UPDATE
- `workouts.date`: string `YYYY-MM-DD` (no timestamp)
- Función RPC: `delete_user()` — SECURITY DEFINER, llama a `auth.admin.deleteUser`
