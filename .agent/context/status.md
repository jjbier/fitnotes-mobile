# Status — FitNotes App

_Last updated: 2026-07-03_

**Paridad completa con la app de referencia FitNotes** (Fases 0–5) **+ paridad visual/funcional web↔mobile** (dashboard, navegación, componentes). **Mobile es 100% offline con cuenta opcional** (plan de 6 fases, `offline-sync.md`): **Fases 0–6 completas** — solo backup/CSV/restaurar/eliminar historial/estadísticas avanzadas siguen requiriendo cuenta real.

## Web ✅ — feature-complete, paridad con mobile
- Auth, middleware guard, todas las rutas conectadas a Supabase
- Nav: 6 secciones (Sidebar/MobileNav) idénticas a las tabs de mobile; `/body-tracker` y `/tools` accesibles desde Configuración
- Dashboard/workout: franja semanal+racha, lista de ejercicios con progress bar+drag&drop+multi-select, WorkoutTimer pausa/reanudar, resumen al finalizar, `/search` global
- `ConfirmDialog` propio (sustituye `confirm()` nativo), `EmptyState` reutilizable, iconos `lucide-react` (sin unicode sueltos)
- Progress, Calendar, Routines, Body Tracker, Tools, Settings: ver detalle en `apps-web.md`
- Accesibilidad WCAG AA, CSP headers, CI/CD, **E2E Playwright**: 13 specs / 66 tests (1 flaky ocasional por timing, no bug)
- **Tailwind v4 `@theme`** corregido 2026-07-02 (bug preexistente desde el scaffold — colores custom no renderizaban)

## Mobile ✅ — APK release estable, paridad con web + offline + cuenta opcional (Fases 0–6, completo)
- 6 tabs + rutas no-tab, dark mode con selector manual, sync cross-device
- FAB Ejercicios: Nuevo ejercicio / **Nueva categoría** (ya no "Nueva rutina")
- Rutinas: menú de opciones en `Modal` propio (Alert.alert limitaba a 3 botones, "Eliminar" no aparecía)
- Fechas en español (`formatWorkoutDate` corregido)
- **Offline + cuenta opcional (Fases 0–6, `offline-sync.md`)**: `expo-sqlite` + 6 repos locales + `SyncEngine` v2 — CRUD de entrenamientos/series, ejercicios/categorías, rutinas, body tracker, goals **y personal records** 100% funcional sin cuenta desde el primer arranque (identidad invitado vía `local_identity`), con sync automático (foreground + reconexión) que se activa al crear/vincular cuenta (`claimGuestIdentity`). PRs generados localmente al completar un set (`computePersonalRecordUpdate`, réplica del trigger SQL) y leídos por `localProgressRepository` (badge de PR, tab Progreso, goals sin PR de peso, resumen semanal). Backup/CSV/recalcular PRs (remoto)/restaurar/eliminar historial/estadísticas avanzadas siguen requiriendo cuenta real (gateadas)
- **Detox E2E funcional**: 10+ tests (smoke/navigation/interactions) actualizados al flujo de login opcional (vía Configuración, no pantalla inicial), corre contra dispositivo físico `ZY22G9PDSV` (`android.attached`) — ver gotchas en `apps-mobile.md`
- **Verificado en dispositivo físico (2026-07-03)**: build reinstalada tras el rediseño de cuenta opcional; confirmado a mano arranque sin login, CRUD offline como invitado (categoría/ejercicio/rutina), banner de Configuración, gating "requiere una cuenta", y claim real contra Supabase al iniciar sesión con `e2e-tests@fitnotes.local` (datos de invitado aparecen con el `user_id` real). Dispositivo devuelto a estado limpio (`pm clear`) tras la prueba

## packages/core ✅ — 215 tests Vitest
## packages/database ✅ — 8 repositorios remotos + 6 repos locales SQLite + SyncEngine v2 offline-first + claim de identidad — 82 tests Vitest

## Datos en Supabase ✅
30 ejercicios de producción (6 por categoría: Tren Inferior/Pecho/Espalda/Hombros/Brazos). Cuenta de test dedicada `e2e-tests@fitnotes.local` — compartida entre specs, frágil ante fechas relativas (ver CLAUDE.md).

## Pendiente real (bloqueado externamente)
- **EAS `projectId`**: placeholder en `app.json` — requiere `eas init` con cuenta Expo real
- `packages/ui` vacío, sin spec
- Sin gaps funcionales conocidos vs. la app de referencia (paridad Fases 0–5 web/mobile)

## Pendiente — plan offline mobile
- Plan completo (Fases 0–6) — sin fases pendientes. Verificación manual en dispositivo físico de la Fase 6 (PRs offline) todavía no repetida tras el rebuild (la última pasada verificada, 2026-07-03, fue anterior a esta fase)
- Duplicado de PRs tras claim+sync (PR local + trigger SQL remoto pueden generar filas distintas para el mismo evento) — aceptado, no resuelto
- Preferencias (`user_metadata`) sin fallback local en modo invitado — gap conocido, no resuelto
- Bug conocido sin fix: sesión Supabase no sobrevive a `force-stop` en mobile (ver `offline-sync.md`)
