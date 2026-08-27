# Checklist de gaps — Página de Ejercicios vs. FitNotes

Análisis realizado el 2026-06-23. Referencia: `docs/fitnotes-reference-exercises.md`.

---

## Gaps comunes a Web y Mobile

- [x] Búsqueda global entre todas las categorías — input en `exercise/page.tsx` (web); lista plana ya busca en todos (mobile)
- [x] "Guardar y nuevo" — botón outline en modal (mobile) + botón en `ExerciseForm` (web, solo al crear)
- [x] Aviso al cambiar tipo — Alert (mobile) + `window.confirm` (web) antes de guardar
- [x] Aviso al cambiar unidad — Alert (mobile) + `window.confirm` (web) antes de guardar; informa que los valores no se convierten
- [x] Acceso al historial del ejercicio desde la lista — ruta `/exercise/history/[id]` (web) + `exercise-history/[exerciseId]` (mobile); `getExerciseHistory()` en repositorio
- [x] Workout count + Last used date — `getExerciseStats()` en el repositorio; mostrado en `ExerciseCard` (web) y `ExerciseRow` (mobile) como "N sesiones · Hace X días"
- [x] Reordenar categorías — drag & drop HTML5 en web (handle ⠿, highlight al arrastrar); botones ↑↓ en mobile (modal de categorías, deshabilitados en extremos)
- [x] Tipos de ejercicio avanzados: Weight+Distance, Weight+Time, Reps+Distance, Reps+Time, Distance Only

---

## Gaps exclusivos de Mobile (la web sí los tiene)

- [x] Editar ejercicio — modal unificado crear/editar con `editingExercise` state
- [x] Campo Notas en el formulario de crear/editar ejercicio
- [x] Unidad de peso seleccionable — selector kg/lb, visible solo para WEIGHT_REPS y WEIGHT_ONLY
- [x] Eliminar ejercicio desde la vista principal — icono papelera en cada `ExerciseRow`
- [x] Gestión de categorías: editar nombre/color y eliminar — modal "Categorías" accesible desde icono ⚙️
- [x] Categoría "Favorites" como sección diferenciada — header "FAVORITOS" encima de los favoritos

---

## Diferencia de navegación Mobile vs. FitNotes

- [x] Alinear navegación mobile con el patrón de FitNotes: categorías → ejercicios de esa categoría. Tab muestra tarjetas de categoría (sin búsqueda) o lista plana (con búsqueda); `exercises/[categoryId].tsx` mejorado con stats, tap → historial, modal edición completo.

---

## Lo que ya está bien (no requiere acción)

- Lista de ejercicios por categorías con colores ✅
- Búsqueda parcial dentro de una categoría ✅
- Favoritos con estrella ✅
- Crear ejercicio: nombre, categoría, tipo ✅
- 5 tipos de ejercicio base: WEIGHT_REPS, DISTANCE_TIME, REPS_ONLY, WEIGHT_ONLY, TIME_ONLY ✅
- Crear categoría inline con color (10 presets + hex) ✅
- Eliminar ejercicio con confirmación ✅
- Gestión de categorías en web: crear, editar nombre/color, eliminar ✅
- Editar ejercicio en web: nombre, notas, categoría, tipo, unidad ✅
