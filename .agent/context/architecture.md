# Arquitectura — FitNotes App

## Monorepo layout

```
fitnotes-app/
├── apps/
│   ├── web/          Next.js 15 App Router — puerto 3000
│   └── mobile/       Expo SDK 52 — Metro bundler
└── packages/
    ├── core/         Lógica pura. SIN react/next/expo.
    ├── database/     Cliente Supabase + tipos + migraciones
    ├── ui/           Tokens de diseño compartidos (no componentes)
    └── tsconfig/     base.json / nextjs.json / expo.json
```

## Flujo de dependencias

```
apps/web  ──┐
            ├──► @fitnotes/core     (zustand, zod, immer)
apps/mobile─┘
            └──► @fitnotes/database (supabase-js, @supabase/ssr)
                └──► @fitnotes/ui   (tokens)
```

## Decisiones de diseño

| Decisión | Razón |
|---|---|
| `packages/core` sin deps de plataforma | Mismo store en web y mobile sin condicionales |
| Zustand + Immer | Mutaciones inmutables simples; sin boilerplate Redux |
| Supabase RLS | Seguridad a nivel DB, no solo API |
| Trigger SQL para PRs | Garantiza consistencia aunque se inserte desde múltiples clientes |
| Last-write-wins en sync | Simplicidad; los datos de fitness raramente tienen conflictos reales |
| `verbatimModuleSyntax` | Fuerza imports `.js` explícitos, compatibilidad con bundlers |
| NativeWind v4 + Tailwind v3 en mobile | v4 de Tailwind no soportado por NativeWind v4 aún |

## Rutas web (App Router)

```
/                      → redirect a /dashboard
/(auth)/login          → login email+password+magic link
/(auth)/register       → registro
/(app)/dashboard       → workout del día
/(app)/workout/[date]  → workout por fecha
/(app)/exercise        → catálogo de ejercicios
/(app)/exercise/[id]   → detalle + historial
/(app)/progress        → PRs + gráficas
/(app)/calendar        → vista mensual
/(app)/routines        → lista de rutinas
/(app)/routines/[id]   → editor de rutina
/(app)/body-tracker    → medidas corporales
/(app)/settings        → ajustes
```

## Rutas mobile (Expo Router)

```
(auth)/login           → login
(auth)/register        → registro
(tabs)/index           → home / workout hoy
(tabs)/calendar        → calendario
(tabs)/exercises       → catálogo
(tabs)/progress        → PRs + stats
workout/[exerciseId]   → modal training (fullScreen)
routines/index         → lista rutinas
routines/[id]          → detalle rutina
```

## Base de datos (Supabase Postgres)

Tablas: `categories`, `exercises`, `workouts`, `workout_exercises`, `sets`, `personal_records`, `routines`, `routine_days`, `routine_day_exercises`, `predefined_sets`, `body_measurements`, `body_measurement_entries`

- Todas tienen `user_id uuid references auth.users` + RLS
- Trigger `update_personal_record()` se dispara en `INSERT/UPDATE` de `sets`
- Enum SQL: `exercise_type`, `goal_type`
