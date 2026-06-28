# Status — FitNotes App

_Last updated: 2026-06-28_

## Web ✅
- Auth: login, register, sign-out, middleware session guard
- Dashboard: workout por fecha, sets CRUD completo (todos los ExerciseTypes)
- Exercises: browse por categoría, crear ejercicio + categoría inline con color picker
- Progress: PRs, Recharts LineChart, 1RM estimates
- Calendar: grid mensual, list view, popup día
- Routines: lista, crear/copiar/eliminar, editor días + ejercicios + predefined sets
- Body Tracker: medidas, log inline, historial
- Tools: 1RM Calculator, Set Calculator, Plate Calculator
- Settings: perfil, weight unit, export CSV, sign-out, delete account
- **loading.tsx + error.tsx** en todas las rutas incluyendo sub-rutas (`exercise/[id]`, `exercise/history/[exerciseId]`, `routines/[id]`, `workout/[date]`)

## Mobile ✅ — APK release en dispositivo Android

### Tabs
| Tab | Estado |
|---|---|
| Hoy | workout por fecha, delete ejercicio del workout, navegar a training ✅ |
| Calendario | grid mensual, list view ✅ |
| Ejercicios | browse + speed dial FAB (crear ejercicio / nueva rutina) ✅ |
| Progreso | PRs expandibles, 1RM estimado ✅ |
| **Rutinas** | lista + crear/editar/copiar/eliminar (menú ⋮) ✅ |
| Configuración | perfil, kg/lb, Herramientas→calculadoras, body-tracker, sign-out, delete ✅ |

### Rutas no-tab
- `workout/[exerciseId]`: sets CRUD completo, todos los ExerciseTypes, RestTimer haptics ✅
- `routines/[id]`: días + ejercicios, edit mode, drag & drop, predefined sets, supersets con nombres personalizables, log day ✅
- `calculators`: 1RM, Set%, Plate calculators (desde Configuración → Herramientas) ✅
- `body-tracker`: CRUD medidas + entradas ✅
- `search/`: búsqueda global de ejercicios con historial ✅
- `goals/`: objetivos por ejercicio ✅
- `exercise-history/[exerciseId]`: historial completo + gráfico LineChart ✅

### Features completadas (Phase 7)
- **Dark mode**: `useTheme()` en todas las pantallas, tab bar, status bar — sigue esquema del sistema
- **Accessibility**: `accessibilityLabel` en todos los icon-only buttons (exercises, index, workout)
- **Superset group names**: nombres personalizables via Alert → modal TextInput; persiste en `routine_day_exercises.group_name` y se propaga al logear workout
- **Config por ejercicio**: `weight_increment`, `default_rest_seconds`, `default_chart`

### Sesión
- FileStorage adapter → sesión persistente indefinida ✅
- AppState sync → refetchSignal actualiza workout de hoy al volver del background ✅

## packages/core ✅
- 144 tests Vitest
- Stores: `useWorkoutStore`, `useExerciseStore`, `useProgressStore`, `useRoutineStore`
- `RoutineDayExercise` y `WorkoutExercise` tienen `group_id?` y `group_name?`

## packages/database ✅
- 7 repositorios: workout, exercise, routine, progress, bodyTracker, calendar, goals
- `routineRepository.updateDayGroupName(groupId, name)` — actualiza todos los miembros de un superset
- Migraciones 001–005 aplicadas en Supabase
- SyncEngine, types generados desde Supabase

## Pendiente / bugs conocidos
- `routines/index.tsx` es código muerto — `(tabs)/tools.tsx` duplica la misma UI; se puede eliminar
- SyncEngine pull no actualiza stores de ejercicios/rutinas (solo workout de hoy via `refetchSignal`)
- `shadcn/ui` descartado — incompatibilidad eslint-config-next + ESLint v9
- `packages/ui` vacío
- Phase 7.6 CI/CD no iniciado (GitHub Actions, EAS build, Vercel config)
