# Status — FitNotes App

_Last updated: 2026-07-01_

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
- Tools: 1RM + Set% + Plate calculators + PRSelector (carga ejercicios de Supabase), RestTimer SVG
- Settings: perfil, kg/lb, 5 toggles, recalcular PRs, backup/restore `.fitnotes`, CSV, Google Drive auto-backup, delete account
- **Accesibilidad WCAG AA**: skip link, focus trap (`lib/useFocusTrap.ts`), roles ARIA, `lang="es"`, per-route layout.tsx
- **Seguridad**: CSP en `next.config.ts` + `vercel.json`, `X-Frame-Options: DENY`, `Referrer-Policy`, `robots.txt`
- **CI/CD**: GitHub Actions (type-check, test, build, lint, rls-audit, EAS), dependabot, PR template, Vercel config
- **E2E Playwright** (`e2e/`): auth.setup.ts + 3 proyectos; 9 spec files — exercises, workout, routines, progress, body-tracker, auth, calculations, tools, phases56

## Mobile ✅ — APK release en dispositivo Android

- Todos los tabs (Hoy/Calendario/Ejercicios/Progreso/Rutinas/Configuración) + rutas no-tab
- Dark mode: `useTheme()` en todas las pantallas
- Sync cross-device: `_layout.tsx` actualiza ejercicios/rutinas en stores directamente (`changedTables`); workout → `refetchSignal`
- Rest timer: solo arranque manual; vibración al terminar (`Vibration.vibrate([0,400,150,400,150,400])`); sin push notifications
- APK release estable

## packages/core ✅ — 144 tests Vitest

## packages/database ✅ — 7 repositorios, migraciones 001–005, SyncEngine completo

## Datos en Supabase ✅
30 ejercicios creados via Management API: 6 en Tren Inferior, Pecho, Espalda, Hombros, Brazos.

## Pendiente real (bloqueado externamente)
- **EAS `projectId`**: placeholder en `app.json` — requiere `eas init` con cuenta Expo real del usuario
- **Detox**: cero tests mobile automatizados
