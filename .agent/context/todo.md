# Trabajo pendiente

_Last updated: 2026-07-01_

## Completado ✅ (Phases 0–7 + pulido + sync + UX fixes + Fases 0–5 plan de paridad FitNotes)

**Core / Database**
- Auth web + mobile, stores Zustand+Immer, 203 tests Vitest
- Ejercicios CRUD (todos los ExerciseTypes), categorías con color, toggle favorito optimistic
- Workout logging: sets CRUD optimistic con rollback, todos los ExerciseTypes, WorkoutTimer con pausa/reanudar (web y mobile)
- Progreso: PRs trigger SQL, Recharts LineChart (métricas ampliadas + tendencia + PNG), tab Estadísticas, ExerciseOverview, goals
- Body Tracker web + mobile: seed por defecto, reorden drag&drop, goal_value, click en gráfica → medidas relacionadas
- Calendario web + mobile: dots coloreados por categoría (toggle vs. círculo), filtros avanzados, toggle panel día, list view con detalle
- Herramientas (1RM, Set% con Add-to-Workout + Select Max, Plate configurable) + PRSelector + RestTimer
- Settings completos: toggles, recalcular PRs, backup/restore compartido (`backupRepository`), CSV, Google Drive con rotación, eliminar historial con filtros, Home Screen Settings
- SyncEngine push/pull/sync con `changedTables` propagado; stores de ejercicios/rutinas actualizados directamente
- Rutinas: supersets+nombres, predefined sets, drag&drop, log day→workout
- Config por ejercicio: weight_increment, default_rest_seconds, default_chart
- Goals, búsqueda global, exercise history con gráfico + export de imagen (mobile)

**Phase 7 — Pulido**
- Dark mode mobile: `useTheme()` en todas las pantallas + selector manual light/dark/system
- Web loading/error boundaries en todas las rutas + sub-rutas
- Virtualización web: `useWindowVirtualizer` en exercise list + category list
- Optimistic updates: TrainingScreen (create/update/delete/toggle) con rollback + error banner
- Accesibilidad WCAG AA web: skip link, focus trap, ARIA roles, `lang="es"`, per-route layout.tsx
- Seguridad: CSP headers, X-Frame-Options, robots.txt
- CI/CD: GitHub Actions (6 workflows), dependabot, PR template, Vercel + EAS config
- E2E Playwright: auth.setup + 3 proyectos + 9 spec files
- Sync cross-device fix: calendar.tsx suscrito a refetchSignal
- APK release Android estable

**UX fixes post-release**
- Rest timer: solo manual (no auto-start), vibración+haptics al terminar, sonido opcional configurable (expo-av)
- 30 ejercicios creados en Supabase: Tren Inferior / Pecho / Espalda / Hombros / Brazos (6 cada uno)

**Plan de paridad FitNotes — Fases 0–5 (2026-07-01, `docs/implementation-plan-2026-07.md`)**
- Fase 0: quick wins (Guardar y nuevo, comentario workout web, guards is_default, weight increment global, toggles PR/complete, reset measurement, estimated records 2-15RM)
- Fase 1: Body Tracker (seed defaults, edición medidas, goal SPECIFIC, history agrupado, drag&drop orden, click gráfica→medidas relacionadas)
- Fase 2: Progress Tracking (tab Estadísticas, métricas ampliadas, copiar a hoy, límite reps, export imagen mobile)
- Fase 3: Calendario paridad mobile (filtros categoría/ejercicio, list view detallada, toggles panel/dots)
- Fase 4: Ajustes y backup (tema mobile, backup/restore completo, recalcular PRs, CSV body tracker, rotación Drive, eliminar historial con filtros, Home Screen Settings)
- Fase 5: Herramientas (Add to Workout, Select Max, Plate configurable, timer pausa web, drag&drop+multiselect home mobile, sonido rest timer)

## Pendiente real (bloqueado externamente)
- **EAS `projectId`**: `app.json` tiene placeholder — `eas init` requiere cuenta Expo del usuario
- **Detox**: cero tests automatizados en mobile
- Instalar APK reconstruido (con expo-av/expo-sharing/react-native-view-shot) en dispositivo — sin ADB device conectado en la última sesión

## Descartado
- `shadcn/ui` — incompatibilidad eslint-config-next + ESLint v9
- `packages/ui` — sin spec de design tokens
- Offline-first SQLite — app funciona directamente con Supabase
