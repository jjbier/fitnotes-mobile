# Status — FitNotes App

_Last updated: 2026-06-30_

## Web ✅ — feature-complete

- Auth: login, register, sign-out, middleware session guard
- Dashboard: workout por fecha, optimistic sets CRUD (todos ExerciseTypes), WorkoutTimer, WakeLock
- Exercises: virtualización `useWindowVirtualizer`, browse + búsqueda global, CRUD, drag-to-reorder categorías, toggle favorito (optimistic); dropdown fijo via `getBoundingClientRect()`
- Exercise history: historial virtualizado, "Ver workout →" link, copy sets
- Workout `[date]`: NavigationPanel sidebar, drag-to-reorder ejercicios, TrainingScreen optimistic con rollback y banner de error de red
- Progress: PRs, Recharts LineChart (métrica + tendencia + PNG export), ExerciseOverview slide-over (4 tabs: Récords/Gráfica/Historial/Objetivos), goals CRUD
- Calendar: grid + lista, dots coloreados por categoría, filtros avanzados (categoría + peso/reps), popup día
- Routines: lista CRUD, editor drag&drop, predefined sets, supersets con nombres, log day → workout
- Body Tracker: log inline, historial, gráfica, settings (habilitar/deshabilitar/crear/eliminar)
- Tools: 1RM + Set% + Plate calculators + PRSelector (carga ejercicios de Supabase), RestTimer SVG + notificaciones
- Settings: perfil, kg/lb, 5 toggles (TrackPRs/AutoComplete/AutoNextSet/KeepScreenOn/weekStart), recalcular PRs, backup/restore `.fitnotes`, CSV, Google Drive auto-backup, delete account
- **Accesibilidad WCAG AA**: skip link, focus trap (`lib/useFocusTrap.ts`), `role="dialog/tablist/tab"`, `aria-current="page"`, `lang="es"`, per-route layout.tsx para metadata en client pages, `aria-live`, `aria-pressed`
- **Seguridad**: CSP en `next.config.ts` + `vercel.json`, `X-Frame-Options: DENY`, `Referrer-Policy`, `robots.txt`
- **CI/CD**: GitHub Actions (type-check, test, build, lint, rls-audit, EAS), dependabot semanal, PR template, Vercel config
- **E2E Playwright** (`e2e/`): auth.setup.ts + 3 proyectos (setup/chromium/chromium-auth); 9 spec files — exercises CRUD, workout flow, routines CRUD, progress tabs, body-tracker log, + 4 legacy tests

## Mobile ✅ — APK release en dispositivo Android

- Todos los tabs (Hoy/Calendario/Ejercicios/Progreso/Rutinas/Configuración) + rutas no-tab
- Dark mode: `useTheme()` en todas las pantallas
- Sync cross-device: todos los tabs suscritos a `refetchSignal` (calendar.tsx fix: ec13f3c)
- APK release estable

## packages/core ✅ — 144 tests Vitest

## packages/database ✅ — 7 repositorios, migraciones 001–005

## Pendiente real (bloqueado externamente)
- **EAS `projectId`**: placeholder en `app.json` — requiere `eas init` con cuenta Expo real del usuario
- **Detox**: cero tests mobile automatizados
- **SyncEngine pull**: no actualiza stores de ejercicios/rutinas (solo workout hoy via `refetchSignal`)
