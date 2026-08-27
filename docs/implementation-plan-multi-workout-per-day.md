# Plan: varios entrenamientos el mismo día (mañana/tarde/etc.)

**Estado:** Fases 2, 3, 6 y 7 implementadas y en producción. Las Fases 4 y 5
(selector "¿a cuál añadir/abrir?" y preguntar "existente vs nuevo") se
implementaron pero se **revirtieron** (2026-07-18) tras feedback directo del
usuario probando la app — ver "Reversión de las Fases 4 y 5" más abajo.
**Motivación del usuario:** hay días con entrenamiento por la mañana y por la
tarde, en horas distintas — hoy la app asume 1 entrenamiento por fecha.

## Contexto de partida

Ya existe la **Fase 1** (implementada, commit previo): guards en la capa de
app (get-or-create) + aviso de conflicto en "mover entrenamiento", para
evitar duplicados **silenciosos** el mismo día. Ese trabajo asume que "dos
entrenamientos el mismo día" es un error a evitar. Este plan hace lo
contrario: permitirlo **explícitamente** cuando el usuario lo quiere, sin
reintroducir el bug de duplicado accidental que ya se cerró.

No hace falta migración de esquema para lo esencial — `workouts` ya no tiene
`UNIQUE` por fecha (nunca lo tuvo) y `Workout` (`packages/core/src/types/index.ts:67`)
ya incluye `start_time`/`end_time`, suficiente para distinguir "mañana" de
"tarde" sin campos nuevos.

## El problema real: todo asume fecha → 1 entrenamiento

Grep de `getWorkoutByDate` muestra el alcance real del cambio — no es un
fix puntual, es transversal:

- **Web rutea por fecha**: `apps/web/app/(app)/workout/[date]/page.tsx` — la
  URL es la fecha, no el id. Con dos entrenamientos el mismo día, una sola
  URL no puede distinguirlos.
- **Atajos "añadir a lo de hoy"** resuelven por fecha y darían por hecho que
  hay como mucho un entrenamiento activo:
  `apps/web/app/(app)/tools/page.tsx`, `apps/web/app/(app)/routines/[id]/page.tsx`,
  `apps/web/app/(app)/progress/page.tsx`, `apps/web/components/progress/ExerciseOverview.tsx`,
  `apps/mobile/app/calculators.tsx`, `apps/mobile/app/exercise-history/[exerciseId].tsx`,
  `apps/mobile/app/(tabs)/index.tsx` (dashboard/Hoy).
- **`MoveWorkoutModal`** (web) y el `moveConflict` de `apps/mobile/app/(tabs)/index.tsx`
  bloquean mover un entrenamiento a una fecha ya ocupada — con soporte
  multi-entrenamiento esto pasa de "bloquear" a "avisar cuántos hay ya".
- **Calendario y Progreso** (ambas apps) muestran/agrupan por día asumiendo
  una sola entrada por celda (color, resumen, navegación al detalle).

## Fases propuestas

### Fase 2 — Identificar entrenamientos por `id`, no por fecha (fundamento)
Sin esto, ninguna fase posterior es segura.
- Sustituir el uso de `getWorkoutByDate(date)` como "el entrenamiento de
  hoy" por una nueva `getWorkoutsByDate(date) → Workout[]` en ambos repos
  (remoto y local), manteniendo `getWorkoutByDate` solo donde de verdad se
  necesita "el primero/único" (o eliminarlo si ya no aplica en ningún sitio
  tras las fases siguientes).
- Introducir el concepto de "entrenamiento activo actual" resuelto por
  `id` (guardado en estado/navegación), no recalculado por fecha en cada
  pantalla.
- Tests en `packages/database` para `getWorkoutsByDate` (remoto + local),
  cubriendo 0/1/N resultados y orden cronológico por `start_time`.

### Fase 3 — Web: rutear por `id`
- Cambiar `apps/web/app/(app)/workout/[date]/page.tsx` a `workout/[id]/page.tsx`
  (o añadir una ruta paralela por id y deprecar la de fecha), actualizando
  todos los `router.push`/`Link` que hoy navegan con la fecha
  (dashboard, calendario, progreso, historial).
- Los enlaces que hoy "van al entrenamiento de hoy" pasan a resolver primero
  la lista de `getWorkoutsByDate(today)` y solo navegan directo si hay
  exactamente 1; si hay más de 1, abren el selector de la Fase 4.

### Fase 4 — Selector "¿a cuál añadir/abrir?" (implementada y luego revertida)
Se implementó un picker (`WorkoutPickerModal` + hook `useWorkoutForDate`,
web y mobile) que preguntaba "¿a cuál quieres añadirlo?" en cuanto había ≥2
entrenamientos — tanto al abrir la app/dashboard (picker de vista) como al
añadir un ejercicio/serie (calculadora, rutina, "+ Nuevo"). **Revertida
por completo** — ver "Reversión de las Fases 4 y 5" más abajo.

### Fase 5 — Permitir crear explícitamente el segundo/tercer entrenamiento (implementada y luego revertida)
Se implementó `forceAskIfAny` (preguntar incluso con un solo entrenamiento
existente) para "+ Nuevo"/rutina, más un botón persistente "+ Nuevo" gateado
a que el activo estuviera finalizado. **Revertida junto con la Fase 4** — ver
más abajo.

## Reversión de las Fases 4 y 5 (2026-07-18)

Feedback directo del usuario probando la app en el móvil: la modal "Varios
entrenamientos" apareciendo automáticamente al abrir la app resultaba
molesta, y no quería que "añadir un entrenamiento nuevo" ofreciera nunca
la opción de sumarlo a uno existente. Se preguntó explícitamente y se
confirmaron dos decisiones:

1. **Nunca mostrar ni preguntar en la vista Hoy/dashboard** — ni al abrir la
   app, ni un chip "Cambiar". Ver un día con varios entrenamientos se hace
   **solo** desde el Calendario (que ya lista cada uno con su hora — Fase 6 —
   y navega directo por `id`, sin preguntar nada más).
2. **Las acciones de "empezar algo" (rutina, "+ Nuevo", "Registrar todo")
   crean siempre un entrenamiento nuevo**, sin preguntar ni reutilizar —
   tiene sentido porque el usuario ya está pidiendo explícitamente "otro".

Para no reintroducir el bug de fragmentación (pulsar "+ Añadir" varias veces
seguidas en la calculadora creando un entrenamiento distinto cada vez), las
acciones de "adjuntar un solo dato rápido" (calculadora, "copiar serie al
entrenamiento de hoy") se dejaron con el comportamiento **anterior a la Fase
4**: reutilizan en silencio el primer entrenamiento del día si existe, y solo
crean uno si no hay ninguno — sin preguntar nunca. Esta distinción
(explícito "empezar" vs. "adjuntar rápido") no se le planteó al usuario en
esos términos exactos; si el resultado no es el esperado, revisar primero
`addSetToTodayWorkout`/`handleCopyToToday`/`handleCopySets` (comportamiento
"reutiliza el primero") frente a `handleLogRoutine`/`handleLogDay`/`handleLogAll`/
"+ Nuevo" (comportamiento "siempre nuevo").

`useWorkoutForDate` y `WorkoutPickerModal` (web y mobile) se borraron por
quedar sin uso. `getWorkoutsByDate`, el routing por `id` (Fase 3) y el
listado/etiquetado del Calendario (Fases 6-7) se mantienen intactos — el
modelo de datos sigue soportando varios entrenamientos por día, solo cambió
qué expone la UI fuera del Calendario.

### Fase 6 — Calendario y Progreso: mostrar N por día
- Celda de calendario (web + mobile): hoy pinta un color/resumen por día;
  pasa a soportar N entrenamientos (p. ej. un punto/badge por cada uno, o
  "2 entrenamientos" en el resumen al tocar el día) y el tap abre el picker
  de la Fase 4 en vez de navegar directo.
- `localCalendarRepository`/`calendarRepository`: revisar
  `getWorkoutCategoryColorsForMonth`/`getWorkoutSummary` — hoy puede que ya
  agreguen correctamente por ser queries sobre `workout_exercises`/`sets`
  sin asumir 1 workout (verificar caso por caso), pero
  `getWorkoutHistoryDetailed` probablemente sí asuma una entrada por día en
  la UI que la consume.
- Progreso: las estadísticas ya agregan por ejercicio/fecha a nivel de
  `sets`, no de `workout`, así que probablemente no necesiten cambios de
  cálculo — solo revisar las vistas que enlazan "ver el entrenamiento de esa
  fecha" (pasan a listar/picker igual que el resto).

### Fase 7 — Etiquetado automático mañana/tarde/noche (calidad de vida)
- Función pura en `packages/core` (`labelWorkoutByTime(start_time)`) que
  devuelve "Mañana"/"Tarde"/"Noche"/"Sin hora" según franja horaria, usada
  en el picker de la Fase 4 y en las celdas de calendario de la Fase 6 —
  evita mostrar solo la hora cruda y hace legible de un vistazo cuál es
  cuál.
- Requiere que `start_time` se rellene de forma fiable al crear un
  entrenamiento (hoy es opcional/`undefined` en varios flujos) —
  revisar/establecer default a la hora de creación si no se ha indicado.

### Fase 8 (opcional, futura, fuera de este alcance inicial) — Nombrar sesiones
- Si con el tiempo el etiquetado automático por hora no basta (p. ej. dos
  entrenamientos por la tarde el mismo día), añadir un campo opcional
  `label`/`comment` editable por el usuario ("Empuje", "Cardio") — esto sí
  requeriría migración de esquema (columna nueva) y su réplica local +
  sync. Se deja fuera del alcance inicial: `Workout.comment` ya existe y
  podría cubrir este caso sin migración, a evaluar cuando llegue la Fase 8.

## Verificación por fase
Cada fase se cierra con: tests unitarios afectados en `packages/core`/
`packages/database`, `tsc --noEmit` en los paquetes/apps tocados, y
verificación manual en el móvil (ADB, dispositivo `ZY22G9PDSV`) + en el
navegador para la parte web, antes de pasar a la siguiente fase.

## Riesgo principal a vigilar
Cambiar el routing de "por fecha" a "por id" (Fase 3) es el cambio de mayor
radio de impacto — cualquier enlace externo, bookmark, o lógica que hoy
componga una URL `/workout/YYYY-MM-DD` a mano dejará de funcionar y necesita
auditoría explícita antes de mover esa fase a producción.
