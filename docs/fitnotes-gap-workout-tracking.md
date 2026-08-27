# Gap Analysis — Workout Tracking vs FitNotes referencia

Comparación entre `apps/mobile/app/workout/[exerciseId].tsx` y la referencia de FitNotes.

---

## Pantalla de entrenamiento

| Característica | Estado | Detalle |
|---|---|---|
| Temporizador de descanso | ✅ | `[exerciseId].tsx` — play/pause, reset, +/−15s, haptics |
| Campos de series (peso/reps/dist/tiempo) | ✅ | Por `ExerciseType` |
| Panel de navegación entre ejercicios | ✅ | Strip horizontal con pills; tap → `router.replace` |
| Estadísticas / PRs del ejercicio | ✅ | Badge dorado PR + historial última sesión collapsible |
| Notas del ejercicio | ✅ | `exercise.notes` mostrado como banner collapsible (fondo ámbar) |
| Menú calculadoras en workout | ✅ | Icono `calculator-outline` en header → `/calculators` |
| Pestañas historial / gráficos | ✅ | Tab bar [Series / Historial / Gráfico] en workout screen — lazy load, LineChart integrado |

## Series

| Característica | Estado | Detalle |
|---|---|---|
| Eliminar serie individual | ✅ | `handleDeleteSet()` con Alert de confirmación |
| Marcar serie completada (checkbox) | ✅ | `handleToggleComplete()` — visual con borde/fondo indigo |
| Auto-relleno con valores previos | ✅ | Pre-rellena del último set actual, o del último set de la sesión anterior |
| Botones +/− ajuste rápido | ✅ | Incrementos: peso ±2.5, reps ±1, distancia ±0.1, tiempo ±5s |
| Comentarios por serie | ✅ | Icono burbuja por set — indigo si tiene nota; tap abre TextInput inline |
| Edición múltiple desde historial | ✅ | Long-press para entrar en modo selección, bulk delete + bulk edit peso/reps |

## Supersets en workout activo

| Característica | Estado | Detalle |
|---|---|---|
| Visual por `group_id` en nav strip | ✅ | Pills con borde de color por grupo (hasta 4 colores) |
| Salto automático al siguiente del grupo | ✅ | Al marcar set completo → navega al siguiente ejercicio del mismo `group_id` |
| Nombres de grupo personalizables | ❌ | No existe en modelo de datos (requiere schema change) |
| Códigos de color por grupo | ✅ | Asignación automática de color por `group_id` |

> Los supersets requieren que el workout se haya logueado desde una rutina con supersets (el `group_id` lo propaga el flujo de rutinas).

## Configuración por ejercicio

| Característica | Estado | Detalle |
|---|---|---|
| Incremento de peso personalizable | ✅ | `exercises.weight_increment` (migración 003) — editable en modal de ejercicio; usado en botones +/− del workout |
| Tiempo de descanso predeterminado por ejercicio | ✅ | `exercises.default_rest_seconds` (migración 003) — editable en modal; inicializa el timer al abrir el ejercicio |
| Gráfico de progreso por defecto | ✅ | Migración 004, selector en exercises.tsx, inicializa en exercise-history |

---

## Resumen de cobertura

| Categoría | ✅ | ⚠️ | ❌ |
|---|---|---|---|
| Pantalla entrenamiento | 6 | 0 | 1 |
| Series | 5 | 0 | 1 |
| Supersets en workout | 3 | 0 | 1 |
| Config por ejercicio | 0 | 0 | 3 |

## Pendiente

Todos los items están implementados. El documento está actualizado.
