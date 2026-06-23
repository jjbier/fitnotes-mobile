# Status — FitNotes App

_Last updated: 2026-06-23_

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
- `routines/[id]`: días + ejercicios, edit mode, drag & drop, predefined sets, supersets, log day ✅
- `calculators`: 1RM, Set%, Plate calculators (desde Configuración → Herramientas) ✅
- `body-tracker`: CRUD medidas + entradas ✅

### Sesión
- FileStorage adapter → sesión persistente indefinida ✅
- AppState sync → refetchSignal actualiza workout de hoy al volver del background ✅

## packages/core ✅
- 144 tests Vitest
- Stores: `useWorkoutStore`, `useExerciseStore`, `useProgressStore`, `useRoutineStore`

## packages/database ✅
- 6 repositorios, SyncEngine, types generados desde Supabase

## Pendiente / bugs conocidos
- `routines/index.tsx` es código muerto — `(tabs)/tools.tsx` duplica la misma UI; se puede eliminar
- SyncEngine pull no actualiza stores de ejercicios/rutinas (solo workout de hoy via `refetchSignal`)
- `shadcn/ui` descartado — incompatibilidad eslint-config-next + ESLint v9
- `packages/ui` vacío
