# Architecture — FitNotes App

_Last updated: 2026-07-02_

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
| Metro `resolveRequest` custom | Mapea `.js` → `.ts` para workspace packages |
| NO `nativewind/babel` plugin | Rompe Metro bundler en producción con NativeWind v4 |
| `expo-sqlite` eliminado de plugins | Causaba ERR_MODULE_NOT_FOUND en startup |
| `android.kotlinVersion=1.9.24` | Compose Compiler 1.5.14 compat con Kotlin 1.9.24 |
| `getSession()` en pantallas (no `getUser()`) | `getUser()` hace round-trip de red — race condition con userId vacío |
| `addExerciseToWorkout(id, data.id)` UUID real | ID local rompía delete/update: FK en DB no coincidía |
| FileStorage como Supabase auth storage | AsyncStorage v1.x NativeModules null en RN 0.76 |
| `group_id` en `routine_day_exercises` y `workout_exercises` | Supersets — comparten group_id UUID |
| `group_name` en ambas tablas | Nombre personalizable del superset, propagado al logear |
| `useRef` para fetch stale en predefined sets | Race condition al cambiar ejercicio rápido en modal |
| `useTheme()` desde `lib/theme.ts` | Dark mode via useColorScheme — NO hardcodear colores hex |
| Tab bar usa `useColorScheme()` directo | Layouts no pueden llamar hooks de la misma forma que componentes |
| `useThemeModeStore` (zustand, fuera de core) en `lib/theme.ts` | Override manual light/dark/system sobre `useColorScheme()`, sincronizado con `user_metadata.theme_preference` |
| Home Screen Settings sin migración DB | Categorías ocultas = lista de IDs client-side (localStorage web / user_metadata mobile) — evita tocar RLS/schema para un ajuste puramente visual |
| Backup/restore mobile sin document-picker nativo | Reutiliza patrón ya usado por import CSV: export vía `Share.share`, restore vía modal de pegado de texto — evita instalar `expo-document-picker` |
| Rest timer sound vía `expo-av` (no `expo-audio`) | SDK 52: `expo-audio` aún beta/inestable en esa versión; `expo-av` es la opción estable para playback simple |
| `@theme inline` en `apps/web/app/globals.css` (2026-07-02) | Tailwind v4 no genera utilidades para colores custom (`bg-primary`, etc.) sin registrarlos en `@theme` — bug presente desde el scaffold, pasó desapercibido porque los tests E2E comprueban DOM/roles, no CSS computado |
| `formatWorkoutDate` con arrays hardcodeados (no `Intl.DateTimeFormat`) | Hermes (RN/mobile) puede tener soporte ICU incompleto — arrays evitan depender de `Intl` en un util compartido con mobile |
| `ConfirmDialog` (React) en vez de `window.confirm()` en web | Paridad visual con mobile (Alert.alert estilizado); rompe cualquier test E2E que use `page.once("dialog", ...)` — hay que clicar el botón del `alertdialog` |
| `Modal` propio en vez de `Alert.alert` para menús >3 opciones (mobile) | Android limita `Alert.alert` a 3 botones nativos; un 4º se descarta en silencio sin error |

## Base de datos (Supabase — ref: `fbhjiwtriqrxibqwsyqj`)

Tablas: `categories`, `exercises`, `workouts`, `workout_exercises`, `sets`,
`personal_records`, `routines`, `routine_days`, `routine_day_exercises`,
`predefined_sets`, `body_measurements`, `body_measurement_entries`

- Todas: `user_id uuid references auth.users` + RLS `auth.uid() = user_id` (FOR ALL)
- Todas: `updated_at` mantenido por trigger
- `personal_records`: auto-update via trigger en `sets` INSERT/UPDATE
- `workouts.date`: string `YYYY-MM-DD` (no timestamp)
- `exercises`: tiene `weight_increment FLOAT`, `default_rest_seconds INT`, `default_chart TEXT`
- `routine_day_exercises.group_id`: UUID compartido entre ejercicios del mismo superset
- `routine_day_exercises.group_name`: nombre personalizable del grupo (nullable)
- `workout_exercises.group_id` + `group_name`: propagados desde rutina al logear
- `body_measurements.order_index`: reorden drag&drop (migración 006)
- `exercise_goals`: tabla de objetivos por ejercicio, gestionada por `goalsRepository`
- Función RPC: `delete_user()` — SECURITY DEFINER

## Migraciones aplicadas (001–006)

1. Schema inicial + RLS + triggers
2. Función delete_user RPC
3. weight_increment, default_rest_seconds en exercises; group_id en workout_exercises y routine_day_exercises; group_name en workout_exercises
4. default_chart en exercises
5. group_name en routine_day_exercises
6. order_index en body_measurements (backfill vía ROW_NUMBER)
