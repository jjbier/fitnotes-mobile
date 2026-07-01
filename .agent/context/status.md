# Status — FitNotes App

_Last updated: 2026-07-01_

**Paridad completa con la app de referencia FitNotes.** Fases 0–5 de `docs/implementation-plan-2026-07.md` completas, incluyendo ítems diferidos (requerían nuevas deps nativas: `expo-av`, `expo-sharing`, `react-native-view-shot`).

## Web ✅ — feature-complete

- Auth: login, register, sign-out, middleware session guard
- Dashboard: workout por fecha, optimistic sets CRUD (todos ExerciseTypes), WorkoutTimer con **pausa/reanudar manual**, WakeLock, contador de series opcional
- Exercises: virtualización `useWindowVirtualizer`, browse + búsqueda global, CRUD, drag-to-reorder categorías, toggle favorito (optimistic); dropdown fijo via `getBoundingClientRect()`
- Exercise history: historial virtualizado, "Ver workout →" link, copy sets
- Workout `[date]`: NavigationPanel sidebar, drag-to-reorder ejercicios, TrainingScreen optimistic con rollback y banner de error de red
- Progress: PRs, Recharts LineChart (métrica + tendencia + PNG export + métricas ampliadas: totalReps/totalDistance/totalTime/maxSpeed/bestPace/weightByReps), tab "Estadísticas" con selector de periodo, ExerciseOverview slide-over, goals CRUD
- Calendar: grid + lista, dots coloreados por categoría (toggle vs. círculo único), filtros avanzados (categoría + peso/reps), popup día (toggle mostrar/ocultar), list view con detalle expandible de series
- Routines: lista CRUD, editor drag&drop, predefined sets, supersets con nombres, log day → workout
- Body Tracker: log inline, historial agrupado por fecha, gráfica con click en punto → medidas relacionadas de esa fecha, reorden drag&drop, CSV export, settings (habilitar/deshabilitar/crear/eliminar/goal_value)
- Tools: 1RM + Set% (con "Add to Workout" y PRSelector) + Plate calculator configurable + PRSelector + RestTimer SVG
- Settings: perfil, kg/lb, toggles, recalcular PRs, backup/restore `.fitnotes`, CSV, Google Drive auto-backup (con **rotación, mantiene últimos 5**), **eliminar historial con filtros** (fecha + ejercicio), **Home Screen Settings** (contador de series + categorías visibles)
- **Accesibilidad WCAG AA**: skip link, focus trap (`lib/useFocusTrap.ts`), roles ARIA, `lang="es"`, per-route layout.tsx
- **Seguridad**: CSP en `next.config.ts` + `vercel.json`, `X-Frame-Options: DENY`, `Referrer-Policy`, `robots.txt`
- **CI/CD**: GitHub Actions (type-check, test, build, lint, rls-audit, EAS), dependabot, PR template, Vercel config
- **E2E Playwright** (`e2e/`): auth.setup.ts + 3 proyectos; 9 spec files — exercises, workout, routines, progress, body-tracker, auth, calculations, tools, phases56

## Mobile ✅ — APK release, paridad con web

- Todos los tabs (Hoy/Calendario/Ejercicios/Progreso/Rutinas/Configuración) + rutas no-tab
- Dark mode: `useTheme()` en todas las pantallas + **selector manual claro/oscuro/sistema** (`useThemeModeStore`)
- Sync cross-device: `_layout.tsx` actualiza ejercicios/rutinas en stores directamente (`changedTables`); workout → `refetchSignal`
- Rest timer: arranque manual; vibración + haptics al terminar; **sonido opcional configurable** (`expo-av`, toggle + volumen); recuerda última duración
- Home ("Hoy"): **drag&drop reorder de ejercicios**, **multi-select para borrar varios**, timer con pausa/reanudar, contador de series opcional
- Calculadoras: Set Calculator con "Add to Workout" + "Select Max" (PRs); Plate Calculator configurable (barra + discos editables)
- Body Tracker: tap en gráfica → medidas relacionadas de esa fecha; export CSV
- Backup/restore completo `.fitnotes` (export vía Share, restore vía modal de pegado), recalcular PRs
- **Nueva pantalla** `workout-detail/[workoutId]` — detalle completo de un workout por fecha arbitraria
- `exercise-history/[exerciseId]` — export de imagen del gráfico (`react-native-view-shot` + `expo-sharing`)
- APK release estable — última build (2026-07-01) con las 3 deps nativas nuevas, **pendiente de instalar** (sin device conectado)

## packages/core ✅ — 203 tests Vitest

## packages/database ✅ — 8 repositorios (incluye `backupRepository`), migraciones 001–006, SyncEngine completo

## Datos en Supabase ✅
30 ejercicios creados via Management API: 6 en Tren Inferior, Pecho, Espalda, Hombros, Brazos.

## Pendiente real (bloqueado externamente)
- **EAS `projectId`**: placeholder en `app.json` — requiere `eas init` con cuenta Expo real del usuario
- **Detox**: cero tests mobile automatizados
- Instalar el APK reconstruido en un dispositivo Android (pendiente por falta de device conectado, no bloqueante)
