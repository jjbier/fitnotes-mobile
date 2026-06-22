# Status — FitNotes App

_Last updated: 2026-06-22_

## Web ✅
- Auth: login, register, sign-out, middleware session guard
- Dashboard: workout por fecha, sets CRUD completo (todos los ExerciseTypes)
- Exercises: browse por categoría, crear ejercicio + categoría inline con color picker
- Progress: PRs, Recharts LineChart, 1RM estimates
- Calendar: grid mensual, list view, popup día
- Routines: lista, crear/copiar/eliminar, editor días + ejercicios + predefined sets
- Body Tracker: medidas, log inline, historial
- Tools: 1RM Calculator, Set Calculator, Plate Calculator
- Settings: perfil, weight unit, export CSV, sign-out, delete account (RPC `delete_user`)

## Mobile ✅
- Auth guard + login/register
- Hoy: workout por fecha, **delete ejercicio del workout** ✅, navigate a training
- Training: **sets CRUD completo** ✅, **delete ejercicio** ✅, todos los ExerciseTypes, RestTimer haptics, kg/lb desde user_metadata
- Ejercicios: browse + FAB crear ejercicio + categoría inline
- Progreso: PRs expandibles, 1RM estimado
- Tools: 1RM, Set%, Plate calculators
- Settings: perfil, kg/lb (user_metadata), sign-out, delete account
- Rutinas: lista/crear/eliminar, días + ejercicios, log routine day → workout real
- Body Tracker: CRUD medidas + entradas (desde Settings)
- Calendario: grid mensual, list view
- Sync: AppState listener, refetchSignal actualiza workout de hoy
- **Sesión persistente**: FileStorage (expo-file-system) — NO AsyncStorage

## Android APK ✅
- `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- CRUD verificado en dispositivo físico (delete + edit persisten en DB)

## packages/core ✅
- 144 tests Vitest — CRUD para los 5 ExerciseTypes
- `removeExerciseFromWorkout`, `removeWorkoutFromHistory` en workoutStore

## packages/database ✅
- 6 repositorios completos, SyncEngine push/pull/sync, types generados

## Pendiente / descartado
- `shadcn/ui` no inicializado (incompatibilidad eslint-config-next + ESLint v9)
- `packages/ui` vacío
- SyncEngine pull no actualiza stores de ejercicios/rutinas (solo workout de hoy)
