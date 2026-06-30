# Trabajo pendiente

_Last updated: 2026-06-30_

## Completado ✅ (Phases 0–7 + pulido)

**Core / Database**
- Auth web + mobile, stores Zustand+Immer, 144 tests Vitest
- Ejercicios CRUD (todos los ExerciseTypes), categorías con color, toggle favorito optimistic
- Workout logging: sets CRUD optimistic con rollback, todos los ExerciseTypes, WorkoutTimer
- Progreso: PRs trigger SQL, Recharts LineChart (métricas + tendencia + PNG), ExerciseOverview, goals
- Body Tracker web + mobile
- Calendario web + mobile (dots coloreados por categoría, filtros avanzados)
- Herramientas (1RM, Set%, Plate) + PRSelector + RestTimer
- Settings completos: toggles, recalcular PRs, backup/restore, CSV, Google Drive, delete account
- SyncEngine push/pull + cola persistente en mobile
- Rutinas: supersets+nombres, predefined sets, drag&drop, log day→workout
- Config por ejercicio: weight_increment, default_rest_seconds, default_chart
- Goals, búsqueda global, exercise history con gráfico

**Phase 7 — Pulido**
- Dark mode mobile: `useTheme()` en todas las pantallas
- Web loading/error boundaries en todas las rutas + sub-rutas
- Virtualización web: `useWindowVirtualizer` en exercise list + category list
- Optimistic updates: TrainingScreen (create/update/delete/toggle) con rollback + error banner
- Accesibilidad WCAG AA web: skip link, focus trap, ARIA roles, `lang="es"`, per-route layout.tsx
- Seguridad: CSP headers, X-Frame-Options, robots.txt
- CI/CD: GitHub Actions (6 workflows), dependabot, PR template, Vercel + EAS config
- E2E Playwright: auth.setup + 3 proyectos + 5 nuevos spec files (exercises/workout/routines/progress/body-tracker)
- Sync cross-device fix: calendar.tsx suscrito a refetchSignal
- APK release Android estable

## Pendiente real (bloqueado externamente)
- **EAS `projectId`**: `app.json` tiene placeholder — `eas init` requiere cuenta Expo del usuario
- **Detox**: cero tests automatizados en mobile
- **SyncEngine pull**: no actualiza stores de ejercicios/rutinas (solo workout hoy)

## Descartado
- `shadcn/ui` — incompatibilidad eslint-config-next + ESLint v9
- `packages/ui` — sin spec de design tokens
- Offline-first SQLite — app funciona directamente con Supabase
