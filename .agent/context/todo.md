# Trabajo pendiente

_Last updated: 2026-07-03_

## Pendiente real (bloqueado externamente)
- **EAS `projectId`**: `app.json` tiene placeholder — `eas init` requiere cuenta Expo del usuario
- Cuenta de test Supabase (`e2e-tests@fitnotes.local`) compartida y frágil ante fechas relativas — algunos specs de Playwright/Detox pueden fallar por datos, no por código (ver CLAUDE.md)
- `packages/ui` vacío, sin spec

## Pendiente — plan offline mobile (completo, Fases 0–6 — ver `offline-sync.md`)
- Duplicado de PRs tras claim+sync: PR generado offline (JS) + el mismo PR regenerado por el trigger SQL remoto al pushear el set — sin dedup entre ambos mecanismos, aceptado
- Multi-dispositivo en modo invitado: dos claims contra la misma cuenta desde dispositivos distintos generan filas duplicadas — aceptado
- Bug sin fix: sesión Supabase no sobrevive a `force-stop` en mobile — ya no bloquea el arranque (cuenta opcional), pero deja el sync parado en silencio hasta volver a iniciar sesión (ver `offline-sync.md`)

Sin gaps funcionales conocidos vs. la app de referencia (paridad web/mobile Fases 0–5). Plan offline mobile completo (Fases 0–6) y preferencias offline, verificados en dispositivo físico 2026-07-03.

## Descartado
- `shadcn/ui` — incompatibilidad eslint-config-next + ESLint v9
- `packages/ui` — sin spec de design tokens

## Historial (más reciente primero)

- **2026-07-03 — Preferencias offline**: `UserPreferences`/`usePreferencesStore` (core) + `localPreferencesRepository` (7º repo local, tabla clave/valor `user_preferences`, fuera de `SYNCABLE_TABLES`) reemplazan el fallback inexistente de `user_metadata` en modo invitado. Local siempre gana como fuente base; `user_metadata` se fusiona encima solo con sesión real. Detalle: `offline-sync.md` § Preferencias offline. Tests: core 219 (+4), database 87 (+5).
- **2026-07-03 — Plan offline Fase 6/6 (personal records)**: `computePersonalRecordUpdate()` réplica el trigger SQL; `localWorkoutRepository.updateSet` genera PRs en la misma transacción; `localProgressRepository` (6º repo local) sirve PRs/resumen semanal/mejores series sin cuenta. Tests: core 215 (+9), database 82 (+12).
- **2026-07-03 — Plan offline Fase 5/6 (cuenta opcional)**: rediseño a mitad de plan — `local_identity` resuelve `userId` siempre presente (invitado o real); `_layout.tsx` ya no fuerza login; `claimGuestIdentity()` migra `user_id` en 13 tablas + `pending_ops` al vincular cuenta; `wipeAndSetIdentity()` en sign-out; body tracker/goals adelantados a esta fase. Guard crítico: `isExplicitSignOut` evita tratar el bug de sesión-no-sobrevive-force-stop como un sign-out real. Detalle completo: `offline-sync.md`.
- **2026-07-03 — Plan offline Fases 0–4/7** (histórico, plan pasó de 7 a 6 fases tras el rediseño de Fase 5): spike `expo-sqlite`, UUIDs reales + `SqlExecutor` + schema local + DI, `localWorkoutRepository`, `SyncEngine` v2 (pull real/cola durable/push por FK/conflicto local-gana-si-dirty), `localExerciseRepository`+`localRoutineRepository`. Bugs encontrados en device testing: `deleteCategory`/`deleteExercise` no replicaban cascadas FK remotas.
- **2026-07-02 — Paridad visual/funcional web↔mobile**: nav a 6 secciones, `/search` global, dashboard con franja semanal+racha+drag&drop+multi-select+resumen final (también en `/workout/[date]`), `ConfirmDialog`/`EmptyState`/`lucide-react` en web. Fix crítico: Tailwind v4 sin `@theme` no generaba CSS para colores custom desde el scaffold inicial.
- **Fases 0–7 + plan de paridad FitNotes (Fases 0–5, `docs/implementation-plan-2026-07.md`)**: construcción completa de la app — auth, CRUD ejercicios/workouts/rutinas/body-tracker/goals, PRs (trigger SQL), calendario, herramientas (1RM/Set%/Plate/RestTimer), settings+backup/CSV/Drive, dark mode, accesibilidad WCAG AA, CSP, CI/CD, E2E (Playwright+Detox), APK release estable. Ver `status.md` para el estado final de cada área.
