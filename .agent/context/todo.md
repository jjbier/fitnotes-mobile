# Trabajo pendiente

_Last updated: 2026-07-03_

## Completado ✅ 2026-07-03 — plan offline mobile, Fase 5 de 6: cuenta opcional

Rediseño pedido por el usuario a mitad del plan original: la app debía funcionar 100% offline **sin cuenta**, activando la sincronización solo al crear/vincular una cuenta. Sustituye lo que iban a ser las Fases 5 (body tracker/goals) y 7 (bootstrap) del plan original, que se fusionaron en esta única Fase 5 rediseñada — el plan pasó de 7 a 6 fases totales. Detalle completo en `offline-sync.md`.

- `local_identity` (tabla singleton SQLite) resuelve un `userId` siempre presente (invitado o cuenta real) vía `RepositoryContext`/`useRepositories()` — reemplaza el patrón de ~13 pantallas llamando a `getSession()` por su cuenta
- `_layout.tsx` ya no fuerza login: arranca siempre en `(tabs)`; "Crear cuenta"/"Iniciar sesión para sincronizar" son acciones desde Configuración
- `claimGuestIdentity()`: al crear/vincular cuenta, reescribe `user_id` (invitado→real) en las 13 tablas locales y en los payloads de `pending_ops` ya encolados, en una transacción — sin necesidad de un módulo de bootstrap aparte (el `sync()` normal ya hace pull completo cuando el watermark está vacío)
- `wipeAndSetIdentity()`: vacía la DB local en sign-out o cambio directo entre dos cuentas reales, con aviso previo si hay cambios sin sincronizar
- **Guard de seguridad crítico** encontrado y corregido antes de cerrar la fase: la comprobación de sesión del arranque en frío no debe tratarse como sign-out (habría borrado datos de una cuenta real cada vez que la sesión no sobrevive a un `force-stop`) — `handleSessionChange` ahora distingue `isExplicitSignOut` (solo `true` en el evento `SIGNED_OUT` real)
- `localBodyTrackerRepository`/`localGoalsRepository` (adelantados desde la antigua Fase 5) + pantallas migradas
- Backup/CSV/recalcular PRs/restaurar/eliminar historial/estadísticas avanzadas gateados tras `requireAccount()` en Settings
- Specs Detox (`smoke`, `navigation`, `interactions`, `routines-delete`) actualizados: el login ya no es la pantalla inicial, se llega a él desde Configuración
- `packages/database`: 69 tests Vitest (+18 desde la Fase 4: local identity, claim, body tracker, goals)
- Limitaciones aceptadas: preferencias `user_metadata` sin fallback local en modo invitado; duplicados si el mismo usuario usa invitado en dos dispositivos antes de crear cuenta

## Completado ✅ 2026-07-03 — plan offline mobile, Fases 0–4 de 7 (histórico, ver arriba para el rediseño)

Plan completo: `.agent/context/offline-sync.md`. Solo mobile (web no cambia).

- Fase 0: spike `expo-sqlite` de-riskeado (build release + arranque en dispositivo físico + Detox, sin repetir el crash histórico)
- Fase 1: `generateUUID()` en core + polyfill Hermes (`expo-crypto`), interfaz `SqlExecutor`, schema local (13 tablas), migraciones versionadas, `RepositoryContext`/`useRepositories()`
- Fase 2: `localWorkoutRepository` — workouts/workout_exercises/sets 100% offline
- Fase 3: `SyncEngine` v2 — pull real, cola durable, push ordering por FK, conflicto local-gana-si-dirty, trigger por reconexión de red (`netinfo`)
- Fase 4: `localExerciseRepository` + `localRoutineRepository` — ejercicios/categorías/rutinas 100% offline; migradas todas las pantallas a `useRepositories()` (patrón "split-repo" donde hay analíticas fuera de alcance)
- Bugs reales encontrados y corregidos durante Fase 4 (device testing, no en tests unitarios): `deleteCategory` no limpiaba `category_id` de sus ejercicios (FK remota `SET NULL`); `deleteExercise` no cascadeaba a workout_exercises/sets/routine_day_exercises/predefined_sets (FK remota `CASCADE`); reorders locales devolvían `{error}` único en vez de array
- Bug conocido sin fix: sesión Supabase no sobrevive a `force-stop` (pre-existente, no introducido por este trabajo)
- Pendiente: Fase 5 (body tracker/goals), Fase 6 (PRs offline), Fase 7 (bootstrap inicial)

## Completado ✅ 2026-07-02 — paridad visual/funcional web↔mobile + bugs reales
- Web: nav restructurada a 6 secciones (igual que mobile), nueva ruta `/search` (búsqueda global)
- Web: Dashboard reconstruido con franja semanal+racha, lista de ejercicios progress-bar+drag&drop+multi-select, resumen al finalizar (`FinishSummaryModal`), aplicado también a `/workout/[date]`
- Web: `ConfirmDialog` propio, `EmptyState` reutilizable, iconos unicode→`lucide-react`, radios de borde aumentados (paridad visual con mobile)
- Web: **fix bug preexistente crítico** — Tailwind v4 sin `@theme` no generaba CSS para `bg-primary`/`text-muted-foreground`/etc. desde el scaffold inicial del proyecto; no lo detectaban los tests (comprueban DOM, no colores)
- Core: `formatWorkoutDate` traducido al español (afecta a web y mobile)
- Mobile: fix Alert.alert de rutinas (límite de 3 botones en Android ocultaba "Eliminar"), FAB Ejercicios "Nueva rutina"→"Nueva categoría"
- Test: specs de Playwright actualizados al nuevo ConfirmDialog (dialog.accept() nativo → clic real en alertdialog)
- Verificado en vivo: Detox (mobile) + Playwright completo (web, 66 tests) + capturas de pantalla en dispositivo físico

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
- Cuenta de test Supabase compartida y frágil ante fechas relativas — algunos specs de Playwright/Detox pueden fallar por datos, no por código (ver CLAUDE.md)

## Pendiente — plan offline mobile (Fase 6 de 6, ver `offline-sync.md`)
- Fase 6: réplica en JS del trigger SQL de personal records — más urgente ahora que antes: un workout registrado como invitado no dispara el trigger remoto hasta que hay claim+sync, así que hoy los PRs no se actualizan en absoluto sin cuenta
- Preferencias vía `user_metadata` (tema, unidades, toggles) sin fallback local en modo invitado — decidir si se resuelve o se acepta como limitación permanente
- Bug sin fix: sesión Supabase no sobrevive a `force-stop` en mobile — ya no bloquea el arranque (cuenta opcional), pero deja el sync parado en silencio hasta volver a iniciar sesión

## Descartado
- `shadcn/ui` — incompatibilidad eslint-config-next + ESLint v9
- `packages/ui` — sin spec de design tokens
