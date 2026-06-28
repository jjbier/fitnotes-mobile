# Trabajo pendiente

_Last updated: 2026-06-28_

## Completado ✅ (todo el plan Phases 0–7)
- Auth web + mobile
- Ejercicios CRUD web + mobile (todos los ExerciseTypes)
- Workout logging: sets CRUD todos los ExerciseTypes
- Progreso: PRs auto-calculados (trigger SQL), charts web + mobile
- Body Tracker web + mobile
- Calendario web + mobile
- Herramientas (1RM, Set%, Plate calculators) web + mobile
- Settings: perfil, kg/lb, export CSV, delete account
- SyncEngine integrado en mobile
- RestTimer con expo-haptics (background notifications)
- Sesión persistente mobile (FileStorage, auto-refresh)
- Delete ejercicio del workout (home + training screen)
- Edit sets persiste en DB
- 144 tests Vitest en packages/core
- Android APK release — verificado en dispositivo físico
- Rutinas completas con supersets + nombres personalizables de grupos
- Predefined sets con race condition fix
- Drag & drop days y ejercicios
- Log routine day → workout real con group_id/group_name propagado
- Speed dial FAB en Ejercicios
- Config por ejercicio: weight_increment, default_rest_seconds, default_chart
- Goals repository + pantalla mobile
- Búsqueda global con historial
- Exercise history con gráfico LineChart
- **Dark mode mobile**: useTheme() en todas las pantallas (12 actualizadas en Phase 7)
- **Web loading/error boundaries** en todas las rutas incluidas sub-rutas
- **accessibilityLabel** en icon-only buttons (exercises, index, workout)

## Pendiente (no crítico)
- Eliminar `routines/index.tsx` (código muerto — `tools.tsx` lo duplica)
- SyncEngine: pull no actualiza stores de ejercicios/rutinas (solo workout de hoy)
- Phase 7.6 CI/CD: GitHub Actions, EAS build, Vercel config, README

## Descartado
- `shadcn/ui` — incompatibilidad eslint-config-next + ESLint v9
- `packages/ui` — sin spec de design tokens
- Offline-first SQLite — app funciona directamente con Supabase; sin red falla graciosamente
