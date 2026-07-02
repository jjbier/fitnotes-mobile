# Status — FitNotes App

_Last updated: 2026-07-02_

**Paridad completa con la app de referencia FitNotes** (Fases 0–5) **+ paridad visual/funcional web↔mobile** (dashboard, navegación, componentes).

## Web ✅ — feature-complete, paridad con mobile
- Auth, middleware guard, todas las rutas conectadas a Supabase
- Nav: 6 secciones (Sidebar/MobileNav) idénticas a las tabs de mobile; `/body-tracker` y `/tools` accesibles desde Configuración
- Dashboard/workout: franja semanal+racha, lista de ejercicios con progress bar+drag&drop+multi-select, WorkoutTimer pausa/reanudar, resumen al finalizar, `/search` global
- `ConfirmDialog` propio (sustituye `confirm()` nativo), `EmptyState` reutilizable, iconos `lucide-react` (sin unicode sueltos)
- Progress, Calendar, Routines, Body Tracker, Tools, Settings: ver detalle en `apps-web.md`
- Accesibilidad WCAG AA, CSP headers, CI/CD, **E2E Playwright**: 13 specs / 66 tests (1 flaky ocasional por timing, no bug)
- **Tailwind v4 `@theme`** corregido 2026-07-02 (bug preexistente desde el scaffold — colores custom no renderizaban)

## Mobile ✅ — APK release estable, paridad con web
- 6 tabs + rutas no-tab, dark mode con selector manual, sync cross-device
- FAB Ejercicios: Nuevo ejercicio / **Nueva categoría** (ya no "Nueva rutina")
- Rutinas: menú de opciones en `Modal` propio (Alert.alert limitaba a 3 botones, "Eliminar" no aparecía)
- Fechas en español (`formatWorkoutDate` corregido)
- **Detox E2E funcional**: 10+ tests (smoke/navigation/interactions), corre contra dispositivo físico `ZY22G9PDSV` (`android.attached`) — ver gotchas en `apps-mobile.md`
- Última build instalada y verificada visualmente en dispositivo (2026-07-02)

## packages/core ✅ — 203 tests Vitest
## packages/database ✅ — 8 repositorios, migraciones 001–006, SyncEngine completo

## Datos en Supabase ✅
30 ejercicios de producción (6 por categoría: Tren Inferior/Pecho/Espalda/Hombros/Brazos). Cuenta de test dedicada `e2e-tests@fitnotes.local` — compartida entre specs, frágil ante fechas relativas (ver CLAUDE.md).

## Pendiente real (bloqueado externamente)
- **EAS `projectId`**: placeholder en `app.json` — requiere `eas init` con cuenta Expo real
- `packages/ui` vacío, sin spec
- Sin gaps funcionales conocidos vs. la app de referencia
