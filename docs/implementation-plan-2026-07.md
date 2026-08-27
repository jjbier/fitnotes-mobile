# Plan de implementación — gaps vs. referencia FitNotes

Auditoría realizada el 2026-07-01 verificando el código real (no solo los docs) en `apps/web` y `apps/mobile` contra los 10 documentos de referencia en `docs/`. Sustituye la tabla "Pendiente" desactualizada de `fitnotes-reference-exercises.md` (líneas 109-121) — esa área está completa, ver Fase 0.

Convención de estado: ✅ implementado · ⚠️ parcial · ❌ no implementado.

---

## Resumen por área

| Área | Estado general |
|---|---|
| Ejercicios | ✅ Completo (1 inconsistencia menor mobile) |
| Rutinas | ✅ Completo, confirmado |
| Body Tracker | ❌ El área con más gaps — sin medidas por defecto, sin reordenar, historial/gráfica limitados |
| Calendario | ⚠️ Web completo, mobile con gaps de filtros y navegación |
| Ajustes | ⚠️ Web razonablemente completo, mobile con gaps grandes (backup, toggles, recalcular PRs) |
| Progreso / Herramientas | ⚠️ Falta tab de Estadísticas completo; gráficas incompletas; calculadoras parciales |
| Home / Dashboard | ⚠️ Gaps menores de paridad web↔mobile |

---

## Fase 0 — Quick wins (consistencia, bajo esfuerzo, sin cambios de schema) ✅ completada 2026-07-01

- [x] Mobile: añadir "Guardar y nuevo" al modal de creación de ejercicio del tab principal y a `exercises/[categoryId].tsx` (el botón no existía realmente en ninguno de los dos, solo la lógica `andNew`)
- [x] Web dashboard: campo de comentario de entrenamiento (textarea con guardado en `onBlur`, igual que mobile)
- [x] Mobile body tracker: proteger medidas `is_default` en editar/eliminar (guard en UI y en las funciones `openEditMeasurement`/`handleDeleteMeasurement`)
- [x] Web: ajuste "Default Weight Increment" global — nuevo setting en localStorage, usado como fallback del `step` del input de peso en `SetRow` cuando el ejercicio no tiene `weight_increment` propio
- [x] Mobile: toggles "Track Personal Records" y "Mark Sets Complete" en ajustes (`user_metadata`), consumidos en `workout/[exerciseId].tsx` para ocultar el badge PR / checkbox de completado
- [x] Body tracker: expuesto `resetMeasurement()` en UI de ambas plataformas (icono ↺ con confirmación)
- [x] Web: Estimated Records — extendido de 2-12RM a 2-15RM

Verificado con `tsc --noEmit` limpio en `apps/web` y `apps/mobile`.

---

## Fase 1 — Body Tracker (mayor prioridad, más gaps) ✅ completada 2026-07-01

- [x] Seed de medidas por defecto (Body Weight, Body Fat) para usuarios nuevos — `seedDefaultMeasurementsIfNeeded()` en el repositorio, invocado al cargar la pantalla en ambas plataformas
- [x] Web: UI de edición de medidas personalizadas (antes solo había toggle + delete) + campo `goal_value` añadido a creación y edición
- [x] Mobile: opción de objetivo `SPECIFIC` añadida (antes solo INCREASE/DECREASE), con lógica de color de delta basada en cercanía al valor objetivo
- [x] History: agrupado por fecha, deltas con color según objetivo, selector de filtro por medida — ambas plataformas
- [x] Track: delta vs. anterior y "tiempo transcurrido" en web (mobile ya lo tenía); timestamp ajustable en el form de alta web
- [x] Graph: línea de objetivo (`goal_value`) dibujada en ambas plataformas (Recharts `ReferenceLine` en web, línea discontinua SVG en mobile)
- [x] Reordenar medidas por drag & drop — migración `006_body_measurement_order.sql` (columna `order_index`) aplicada en Supabase, tipos regenerados, `reorderMeasurements()` en el repositorio, drag&drop nativo en ambas plataformas
- [x] Selección de punto de dato en gráfica → medidas relacionadas de esa fecha — web: `onClick` de Recharts (`activeLabel`) + panel con el resto de medidas de ese día; mobile: nueva prop `onPointPress` en `components/LineChart.tsx` + mismo panel, reutilizando `getAllEntries()`

Verificado con `tsc --noEmit` limpio en `apps/web`, `apps/mobile` y `packages/database`, y suite de tests de `@fitnotes/core` (203/203 ✅).

---

## Fase 2 — Progress Tracking y Estadísticas ✅ completada 2026-07-01

- [x] Nueva tab "Estadísticas" con selector de periodo (Sesión/Semana/Mes/Año/Todo/Personalizado) — implementada en ambas plataformas (`PeriodStats.tsx` en web, integrada en `progress/page.tsx` y `ExerciseOverview.tsx`; period selector añadido a la tab "Estadísticas" ya existente en mobile `exercise-history`)
- [x] Métricas de gráfica ampliadas: `ChartPoint` extendido con `totalReps`, `totalDistance`, `totalTime`, `maxSpeed`, `bestPace`, `weightByReps` (peso por nº de reps exacto); nuevos modos "Peso por reps" y "Progresión rep max" en ambas plataformas
- [x] Mobile: añadida acción "Copiar a hoy" por serie en el historial (editar ya existía); "ver workout completo" — nueva pantalla `workout-detail/[workoutId].tsx` (ejercicios + series de un workout por fecha arbitraria, vía `calendarRepository.getWorkoutSetDetail`), enlazada desde el header de cada sesión en el historial
- [x] Límite de repeticiones configurable para excluir outliers en Estimated Records — ajuste en ambas plataformas, aplicado en `PersonalRecords.tsx` (web) y en el cálculo de `bestORM` (mobile)
- [x] Graph: mostrar/ocultar puntos y escala Y (auto/desde 0) añadidos en web; línea de tendencia añadida en mobile (`LineChart` con `trendData`). Exportar imagen en mobile — `react-native-view-shot` + `expo-sharing` (nuevas dependencias nativas), botón "Compartir imagen del gráfico" en `exercise-history`
- [x] "Exercise Overview" ahora accesible desde el Calendario (web) además de la lista de récords; incorpora su propia tab "Estadísticas"

Verificado con `tsc --noEmit` limpio en `apps/web`, `apps/mobile` y `packages/core`/`packages/database`, y 203/203 tests de `@fitnotes/core`.

---

## Fase 3 — Calendario (paridad mobile) ✅ completada 2026-07-01

- [x] Mobile: Category Filter añadido (selección múltiple, Match All/Any) — modal de filtros combinado, misma lógica que web (`getWorkoutCategoryIdsForMonth`)
- [x] Mobile: condiciones de peso/reps añadidas al Exercise Filter (`getWorkoutDatesForExerciseWithConditions`), con flujo de "seleccionar ejercicio → aplicar filtro"
- [x] Mobile: ejercicios del día seleccionado ahora navegables → abren `exercise-history/[exerciseId]`
- [x] Contador total de entrenamientos del mes visible junto al nombre del mes — ambas plataformas
- [x] List view: puntos de categoría, nombre de categoría y detalle de series (expandible al tocar cada fila) — ambas plataformas, nuevas funciones de repositorio `getWorkoutHistoryDetailed` y `getWorkoutSetDetail`
- [x] Toggle panel inferior de entrenamiento y toggle puntos de categoría vs. círculo único — añadidos en la cabecera del calendario (ambas plataformas), persistidos vía `SETTING_KEYS` (web, `localStorage`) y `user_metadata` (mobile)

Verificado con `tsc --noEmit` limpio en `apps/web`, `apps/mobile` y `packages/database`, y 203/203 tests de `@fitnotes/core`.

---

## Fase 4 — Ajustes y gestión de datos (paridad mobile) ✅ completada 2026-07-01

- [x] Mobile: selector manual de tema claro/oscuro/sistema — `useThemeModeStore` (zustand) en `lib/theme.ts`, inicializado desde `user_metadata.theme_preference` en `_layout.tsx`, UI en Ajustes
- [x] Mobile: Backup/Restore completo (.fitnotes JSON) — nuevo `createBackupRepository` compartido en `@fitnotes/database` (`exportBackup`/`restoreBackup`/`isBackupData`), export vía `Share.share`, restore vía modal de pegado + parseo (mismo patrón que la importación CSV existente, sin nuevas dependencias nativas)
- [x] Mobile: recalcular Personal Records — `backupRepository.recalculatePersonalRecords()`, mismo algoritmo que la versión web
- [x] Mobile: exportar CSV de Body Tracker — `bodyTrackerRepository.exportAllCSV()` + botón compartir
- [x] Web: rotación de backups automáticos a Google Drive — `rotateOldBackups()` en `api/google/backup/route.ts`, lista archivos `fitnotes-backup-*` y borra los más antiguos manteniendo solo 5
- [x] Ambas: Delete Workout History con filtro por rango de fechas y por ejercicio — `workoutRepository.deleteWorkoutHistory(userId, {dateFrom, dateTo, exerciseId})`, limpia workouts que quedan vacíos tras borrar el ejercicio filtrado; UI de filtros en ambas plataformas
- [x] Home Screen Settings — toggle "Mostrar contador de series" (badge series completadas/totales en pestañas de ejercicio del dashboard web, condicional en el home de mobile que ya lo mostraba fijo) y "Categorías visibles" (categorías desmarcadas se ocultan del selector de "+ Ejercicio"), ambas plataformas

Verificado con `tsc --noEmit` limpio en `apps/web`, `apps/mobile` y `packages/database`, y 203/203 tests de `@fitnotes/core`.

---

## Fase 5 — Herramientas de entrenamiento y Home screen ✅ completada 2026-07-01

- [x] Set Calculator: botón "Add To Workout" — añadido en ambas plataformas (`apps/web/app/(app)/tools/page.tsx`, `apps/mobile/app/calculators.tsx`). Selector de ejercicio + reps, crea (o reutiliza) el entrenamiento y el `workout_exercise` de hoy y añade el set calculado
- [x] Mobile: Set Calculator — "Select Max" desde PRs añadido (modal de selección de ejercicio + carga del mejor PR), paridad con web
- [x] Mobile: Plate Calculator configurable — peso de barra e inventario de discos ahora editables por texto, igual que web
- [x] Mobile home ("Hoy"): drag & drop para reordenar ejercicios directamente en la lista — `NestableDraggableFlatList` + `reorderExercises` (store) + `workoutRepository.reorderExercises` (persistencia), mismo patrón ya usado en `workout/[exerciseId].tsx`
- [x] Mobile home: multi-select para borrar varios ejercicios del workout de golpe — modo selección con checkboxes y borrado en lote
- [x] Web dashboard: modo pausa/manual del timer de entrenamiento — `WorkoutTimer.tsx` reescrito con botón pausa/reanudar, mismo patrón de acumulación de segmentos que ya usaba el tab "Hoy" de mobile
- [x] Rest Timer — sonido/alarma con volumen ajustable (petición explícita del usuario 2026-07-01, sustituye la decisión previa de solo vibración). `expo-av` (nueva dependencia nativa), sonido de dos beeps generado con ffmpeg (`assets/sounds/timer-end.mp3`), toggle "Sonido del rest timer" + input de volumen 0-100 en Ajustes, reproducido junto a la vibración/haptics existentes al terminar el descanso. "Recordar última duración usada" ya estaba implementado (`last-timer-duration.json` vía `expo-file-system`) — la auditoría original lo listaba como pendiente por error

Verificado con `tsc --noEmit` limpio en `apps/web`, `apps/mobile` y `packages/database`, y 203/203 tests de `@fitnotes/core`. Con esta fase se cierra el plan completo de gaps vs. la referencia FitNotes (Fases 0–5).

---

## Notas de alcance

- **Rutinas**: no requiere trabajo, confirmado 100% implementado.
- **Backup tradicional**: dado que la app sincroniza vía Supabase en tiempo real, el backup/restore local tiene valor como exportación/portabilidad y protección ante borrado accidental, no como mecanismo de continuidad entre dispositivos.
- Los ítems marcados "baja prioridad / cosmético" son patrones heredados de la UI de FitNotes con bajo impacto medible; se recomienda no priorizarlos salvo pedido explícito.

## Cierre de diferidos — 2026-07-01

A petición explícita del usuario se implementaron todos los ítems que habían quedado diferidos en las Fases 0-5 (incluyendo los dos que requerían nuevas dependencias nativas: `react-native-view-shot`/`expo-sharing` para exportar imagen, y `expo-av` para el sonido del rest timer). Verificado con `tsc --noEmit` limpio en todo el monorepo y 203/203 tests de `@fitnotes/core`. APK release reconstruido con éxito (`assembleRelease`, autolinking incorporó las 3 dependencias nuevas sin cambios adicionales) — pendiente de instalar en dispositivo la próxima vez que haya uno conectado por ADB.
