# FitNotes Mobile — Análisis de gaps y deuda técnica

> Generado: 2026-06-25

---

## 🐛 Bugs detectados

### ~~Bug 1: `is_warmup` ausente en historial de ejercicios~~ ✅ RESUELTO
- `is_warmup` añadido a `SetRow`, al select de `getExerciseHistory()`, al tipo `built`, y al mapeo de sets
- Stats tab ahora filtra warmup con `is_complete && !is_warmup`
- Badge "W" ámbar visible en la lista de historial

### ~~Bug 2: Body tracker — historial no carga al cambiar de tab~~ ✅ YA ESTABA RESUELTO
- `onPress` del tab bar ya llamaba `loadHistory()` al cambiar a "history"

### ~~Bug 3: Body tracker — primer gráfico no carga automáticamente~~ ✅ YA ESTABA RESUELTO
- El tab bar ya cargaba el primer gráfico al cambiar a "chart" si no había selección

### Bug 4: Goals — progreso solo funciona para objetivos de peso
- **Archivo**: `app/goals/index.tsx` (líneas 188-198)
- El código maneja `target_weight` y `target_reps` correctamente con `??`. El problema real es que los PRs de ejercicios sin peso (reps-only) no se detectan porque el trigger SQL ignora exercises sin peso
- **Severidad**: Baja

### ~~Bug 5: Calendar — sin navegación a workout para edición~~ ✅ YA ESTABA RESUELTO
- El panel del día ya tenía botón "Ver →" que navega a `/(tabs)` con `date` param

### ~~Bug 6: Export CSV no incluye `is_warmup`~~ ✅ RESUELTO
- Columna `Warmup` añadida al header y a cada fila del CSV

---

## Gaps por área

### Notificaciones — rest timer en background
- **Impacto**: Alto
- **Esfuerzo**: 3-4h
- **Requiere DB migration**: No
- **Descripción**: El rest timer para cuando la app se minimiza. Requiere `expo-notifications` + reconstruir APK (`expo install expo-notifications` y configurar en `app.json`). Actualmente solo haptics al finalizar, solo si app está en primer plano

### ~~Importar/restaurar datos~~ ✅ RESUELTO
- `importFromCSV(rows, userId)` en workoutRepository: parseo, dedup por fecha, crea ejercicios faltantes
- Modal en Configuración → Cuenta con TextInput multiline para pegar CSV, contador de filas detectadas y feedback post-importación

### Detección automática de objetivos logrados
- **Impacto**: Medio
- **Esfuerzo**: 2-3h
- **Requiere DB migration**: No (la lógica puede ir en el trigger de PRs o en el cliente)
- **Descripción**: Cuando se crea un nuevo PR que supera `exercise_goals.target_weight`, debería marcarse `achieved_at` automáticamente. Actualmente solo se puede marcar manual. Un trigger SQL en `personal_records` o lógica en el cliente al cargar el workout

### Body tracker — `goal_type` y `goal_value` no configurables desde UI
- **Impacto**: Medio
- **Esfuerzo**: 1-2h
- **Requiere DB migration**: No (columnas ya existen)
- **Descripción**: Al crear/editar una medida corporal no hay selector de "objetivo: INCREASE/DECREASE" ni campo para el valor objetivo. `goal_type` se usa en el gráfico (para saber si "mejor" = mínimo o máximo) pero el usuario no puede configurarlo desde la app. El formulario en `setMeasureModal` está incompleto

### ~~Date picker nativo~~ ✅ RESUELTO
- `DateInput` component en `components/DateInput.tsx` con `@react-native-community/datetimepicker`
- Reemplazados los 3 TextInput de texto libre: move workout modal, body tracker log entry, goals target_date
- Muestra fecha formateada en español, icono de calendario, botón clear opcional

### ~~Filtros avanzados en historial de ejercicio~~ ✅ RESUELTO
- Toggle "Ocultar calentamientos" en la cabecera del tab Historial (activo por defecto)
- Filtra visualmente las series W y recalcula el volumen de la sesión

### Rutinas — uso/estadísticas de cada rutina
- **Impacto**: Medio
- **Esfuerzo**: 2h
- **Requiere DB migration**: No
- **Descripción**: La lista de rutinas en `app/(tabs)/tools.tsx` solo muestra nombre y notas. No hay "última vez usada: hace 3 días" ni conteo de sesiones. Requiere query `workouts` filtrada por los ejercicios de la rutina

### ~~Actividad reciente con detalle~~ ✅ RESUELTO
- `getWorkoutsWithSummary(10)` en workoutRepository: 3 queries planas → ejercicios y volumen por workout
- Home screen muestra "X ejercicios · Yk kg" debajo de cada fecha en actividad reciente

### Búsqueda global
- **Impacto**: Bajo
- **Esfuerzo**: 3-4h
- **Requiere DB migration**: No
- **Descripción**: No hay búsqueda que cruce ejercicios + fechas + historial. Útil para "¿cuándo fue la última vez que hice sentadilla?" pero FitNotes classic tampoco lo tenía

### Tema oscuro
- **Impacto**: Bajo
- **Esfuerzo**: 8-15h
- **Requiere DB migration**: No
- **Descripción**: Todo el CSS usa colores hardcoded (`#0f172a`, `#f1f5f9`, etc.). Refactorizar a un sistema de temas requeriría context + StyleSheet dinámico en toda la app

---

## Deuda técnica

| Problema | Archivo(s) | Impacto |
|---|---|---|
| ~~`getExerciseHistory` no selecciona `is_warmup`~~ | `exerciseRepository.ts` | ✅ Resuelto |
| ~~Carga de ejercicios duplicada en ~8 pantallas~~ | Todas las tabs | ✅ Resuelto |
| ~~`createXxxRepository()` en cada render sin useMemo~~ | Todas las pantallas | ✅ Resuelto |
| ~~`tools.tsx` duplica `routines/index.tsx`~~ | Ambos | ✅ Resuelto |
| ~~`exerciseHistory` stats no filtran warmup~~ | `exercise-history/[exerciseId].tsx:307` | ✅ Resuelto |

---

## Prioridades

### Hacer ahora (bugs que afectan datos)
1. ~~Añadir `is_warmup` a `SetRow` + `getExerciseHistory` y filtrar en stats~~ ✅
2. ~~Auto-carga de historial en body tracker al cambiar tab~~ ✅ (ya estaba)
3. ~~Auto-carga del primer gráfico en body tracker~~ ✅ (ya estaba)
4. ~~Botón "ir a este día" desde el calendario~~ ✅ (ya estaba)

### Siguiente (features de impacto real)
5. ~~Configurar `goal_type`/`goal_value` en body tracker~~ ✅
6. ~~Detección automática de goals logrados~~ ✅
7. ~~Date picker nativo~~ ✅

### Backlog
8. Notificaciones rest timer (requiere rebuild APK)
9. ~~Estadísticas de uso en rutinas~~ ✅ (última sesión + conteo en tarjeta de rutina)
10. Importar/restaurar datos
