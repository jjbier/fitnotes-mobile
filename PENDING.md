# FitNotes App — Tareas Pendientes

> Generado el 2026-06-29. Basado en auditoría del PLAN.md contra el código actual.

---

## Alta prioridad — funcionalidad core incompleta

### ~~Web: `workout/[date]/page.tsx`~~ ✅
- Carga workout por fecha, NavigationPanel sidebar, TrainingScreen, añadir ejercicio, finalizar.

### ~~Web: Goals en pantalla de Progreso~~ ✅
- Pestaña "Objetivos" en progress/page.tsx: progress bars (peso + reps), CRUD inline, marcar conseguido.

---

## Media prioridad — features de workflow

### Web: Modales del workout
- [x] ~~`SetCommentModal`~~ ✅ — modal con textarea, Escape, backdrop click, Borrar/Guardar
- [x] ~~`WorkoutTimer`~~ ✅ — cuenta desde start_time, MM:SS / H:MM:SS, en dashboard y workout/[date]
- [x] ~~`ShareWorkoutModal`~~ ✅ — checkboxes por ejercicio, vista previa, copiar al portapapeles
- [x] ~~`CopyWorkoutModal`~~ ✅ — lista entrenamientos anteriores, copia ejercicios no duplicados

### Web: Gestión del workout
- [x] ~~Mover workout a otra fecha~~ ✅ — MoveWorkoutModal con date picker, detección de conflicto, redirect
- [x] ~~PR badge (🏆) inline en `SetRow`~~ ✅ — carga PRs por ejercicio, muestra 🏆 si weight ≥ best stored PR

### ~~Web + Mobile: Calendar dots por categoría~~ ✅
- [x] `getWorkoutCategoryColorsForMonth` en calendarRepository (join workouts→exercises→categories)
- [x] Web y Mobile: hasta 4 dots de color por día, uno por categoría entrenada

---

## Baja prioridad — polish y features avanzadas

### Web: Pantalla de Progreso (mejoras)
- [x] ~~Toggle trend line en `ProgressChart`~~ ✅ — botón "Tendencia", regresión lineal, línea naranja punteada
- [x] ~~Botón "Exportar" para descargar gráfica como PNG~~ ✅ — SVG→Canvas→PNG sin dependencias, con título (ejercicio + métrica)
- [x] ~~Tabs "Estimado / Real" en PRs~~ ✅ — Real muestra PRs almacenados, Estimado muestra tabla 1–12 reps desde mejor 1RM
- [x] ~~Editar sets desde Historial~~ ✅ — acordeón por fecha, carga sets bajo demanda, edición inline por tipo de ejercicio

### ~~Web: Calendario (filtros avanzados)~~ ✅
- [x] ~~Filtro por categoría muscular (Match All / Match Any)~~ — chips de colores, Cualquiera/Todas, client-side
- [x] ~~Filtro por ejercicio con condiciones: peso ≥ X, reps ≥ Y~~ — repo query con sets, dimming días no matching, ring en matching

### ~~Web: Settings avanzados~~ ✅
- [x] Toggle: Track Personal Records — suprime 🏆 en SetRow cuando está desactivado
- [x] Toggle: Mark Sets Complete — al añadir serie, la anterior se auto-completa
- [x] Toggle: Auto-Select Next Set — scroll suave a la siguiente serie incompleta
- [x] Toggle: Keep Screen On — Wake Lock API en dashboard y workout/[date]
- [x] Selector: día de inicio de semana — sincroniza con calendario web

### Mobile
- [x] ~~Swipe left/right entre meses en calendario~~ ✅ — PanResponder + Animated slide, threshold 60px, spring back si no supera umbral

### Ambas plataformas
- [x] ~~Backup / Restore archivo `.fitnotes`~~ ✅ — web: export JSON con 13 tablas, restore con modal confirmación + progreso por paso
- [x] ~~Backup automático a Google Drive~~ ✅ — OAuth2 + Drive API server-side, toggle auto-backup al finalizar entrenamiento

---

## Descartado / fuera de scope

| Item | Motivo |
|---|---|
| `packages/ui` | Vacío, no se inició — sin necesidad clara |
| `shadcn/ui` | Incompatibilidad `eslint-config-next` + ESLint v9 |
| `routines/index.tsx` mobile | Código muerto — el tab de Rutinas usa `(tabs)/tools.tsx` que duplica la UI |
| SyncEngine pull completo | Solo sincroniza workout del día; ejercicios/rutinas requieren rediseño del flujo |
| T7.13 EAS build cloud | Workflow creado; requiere cuenta Expo + `EXPO_TOKEN` para ejecutarse |
