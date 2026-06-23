# Trabajo pendiente

_Last updated: 2026-06-23_

## Completado ✅
- Auth web + mobile
- Ejercicios CRUD web + mobile (todos los ExerciseTypes)
- Workout logging: sets CRUD todos los ExerciseTypes
- Progreso: PRs auto-calculados (trigger SQL), charts web
- Body Tracker web + mobile
- Calendario web + mobile
- Herramientas (1RM, Set%, Plate calculators) web + mobile
- Settings: perfil, kg/lb, export CSV, delete account
- SyncEngine integrado en mobile
- RestTimer con expo-haptics
- Sesión persistente mobile (FileStorage, auto-refresh)
- Delete ejercicio del workout (home + training screen)
- Edit sets persiste en DB
- 144 tests Vitest en packages/core
- Android APK release — verificado en dispositivo físico
- **Rutinas completas:**
  - Lista + crear/editar/copiar/eliminar (menú ⋮)
  - Días + ejercicios por día
  - Drag & drop reordenar days y ejercicios
  - Predefined sets por ejercicio (modal, race condition fix)
  - Supersets (group_id, barra morada)
  - Log routine day → workout real
- Speed dial FAB en Ejercicios (crear ejercicio / nueva rutina)
- Reorganización tabs: Rutinas en tab "Herramientas", calculadoras en Configuración

## Pendiente
- Eliminar `routines/index.tsx` (código muerto — `tools.tsx` lo duplica)
- SyncEngine: pull no actualiza stores de ejercicios/rutinas (solo workout de hoy)

## Descartado
- `shadcn/ui` — incompatibilidad eslint-config-next + ESLint v9
- `packages/ui` — sin spec de design tokens
