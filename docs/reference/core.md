# Referencia — `packages/core`

_Generado a partir de la documentación TSDoc añadida al código fuente (2026-07-16). Cero dependencias de plataforma (react/next/expo) — TypeScript puro + Zustand + Immer + Zod._

## `src/index.ts`
Barrel de entrada de `@fitnotes/core`: reexporta tipos, stores Zustand, utilidades y esquemas Zod compartidos entre web y mobile.

| Export | Tipo | Descripción |
|---|---|---|
| `useWorkoutStore` | const | Store Zustand del entrenamiento activo/historial |
| `useExerciseStore` | const | Store Zustand de categorías y ejercicios |
| `useProgressStore` | const | Store Zustand de PRs, goals y datos de gráfico |
| `useRoutineStore` | const | Store Zustand de rutinas/días/ejercicios/sets predefinidos |
| `useBodyTrackerStore` | const | Store Zustand del body tracker |
| `usePreferencesStore` | const | Store Zustand de preferencias de usuario |

## `src/schemas/index.ts`
Esquemas Zod para validar en runtime los tipos de dominio, usados sobre todo en inputs de formularios.

| Export | Tipo | Descripción |
|---|---|---|
| `weightUnitSchema` | const | Valida `kg` o `lb` |
| `exerciseTypeSchema` | const | Valida cualquier valor del enum `ExerciseType` |
| `goalTypeSchema` | const | Valida cualquier valor del enum `GoalType` |
| `categorySchema` | const | Valida una `Category` completa, color como hex de 6 dígitos |
| `exerciseSchema` | const | Valida un `Exercise` completo |
| `workoutSchema` | const | Valida un `Workout` completo, `date` en formato `YYYY-MM-DD` |
| `workoutExerciseSchema` | const | Valida la relación ejercicio-en-entrenamiento incl. `group_id` de supersets |
| `setSchema` | const | Valida un set de un ejercicio dentro de un entrenamiento |
| `personalRecordSchema` | const | Valida un récord personal |
| `routineSchema` | const | Valida una rutina sin sus días |
| `routineDaySchema` | const | Valida un día de una rutina |
| `routineDayExerciseSchema` | const | Valida un ejercicio dentro de un día de rutina |
| `predefinedSetSchema` | const | Valida un set predefinido de un ejercicio de rutina |
| `bodyMeasurementSchema` | const | Valida una medida corporal configurable con su objetivo |
| `bodyMeasurementEntrySchema` | const | Valida una entrada registrada de una medida corporal |
| `createExerciseInputSchema` / `CreateSetInputSchema` / `createRoutineInputSchema` / `createBodyMeasurementEntryInputSchema` | const | Variantes "input de creación" (sin `id`/`created_at`) de los esquemas anteriores |
| `CategoryInput`, `ExerciseInput`, `SetInput`, `RoutineInput`, `BodyMeasurementEntryInput` | type | Tipos inferidos de los esquemas de creación |

## `src/stores/` — Zustand + Immer

| Archivo | Export | Descripción |
|---|---|---|
| `bodyTrackerStore.ts` | `useBodyTrackerStore` | Mediciones corporales y sus entradas en el tiempo, con la última entrada cacheada aparte |
| `exerciseStore.ts` | `useExerciseStore` | Categorías y ejercicios; `favorites` es una lista derivada de `is_favorite` |
| `preferencesStore.ts` | `usePreferencesStore` | Preferencias de usuario; estado inicial `DEFAULT_PREFERENCES` hasta hidratar desde el repositorio |
| `progressStore.ts` | `useProgressStore`, `ChartPoint` (interface) | PRs por ejercicio, goals y puntos de gráfico agregados por día. `ChartPoint` debe mantenerse sincronizado campo a campo con la interfaz homónima de `packages/database/src/repositories/progressRepository.ts` |
| `routineStore.ts` | `useRoutineStore` | Rutinas/días/ejercicios/sets predefinidos; delega en la UI la creación real del workout vía `pendingRoutineLog` |
| `workoutStore.ts` | `useWorkoutStore` | Entrenamiento activo y del historial, sets indexados por `workout_exercise_id`, UUIDs reales generados en cliente |

## `src/types/`

`index.ts` — tipos de dominio compartidos entre web y mobile (fuente de verdad de forma de los datos): `ExerciseType` (10 variantes: base + avanzadas), `GoalType`, `WeightUnit`, `Category`, `Exercise`, `Workout`, `WorkoutExercise` (soporte de supersets), `Set`, `PersonalRecord`, `Routine`, `RoutineDay`, `RoutineDayExercise`, `PredefinedSet`, `ExerciseGoal`, `BodyMeasurement`, `BodyMeasurementEntry`.

`preferences.ts` — `UserPreferences` (interface, 16 claves: tema, unidades, toggles de entrenamiento, timer, calendario) + `DEFAULT_PREFERENCES` (const, fallback para modo invitado / dispositivo sin preferencias guardadas).

## `src/utils/`

**`calculations.ts`** — cálculos de fitness puros:

| Export | Descripción |
|---|---|
| `getExerciseFields` / `ExerciseFields` | Traduce un `ExerciseType` a qué campos debe mostrar la UI |
| `NO_EXERCISE_FIELDS` / `ALL_EXERCISE_FIELDS` | Fallbacks de campos |
| `EXERCISE_TYPE_LABELS` | Etiqueta en español de cada `ExerciseType` |
| `formatSetTime` | Formatea segundos como `Xs`/`Xmin`/`M:SS` |
| `formatSetDisplay` / `SetFieldsInput` | Formatea los campos de un set para mostrar, según su tipo de ejercicio |
| `formatClockDuration` / `formatMinutesSeconds` / `formatChartDuration` | Variantes de formato de duración (reloj, sin rollover de horas, para gráficos) |
| `DEFAULT_PLATES` | Denominaciones de discos de barra por defecto en kg |
| `calculate1RM` | Fórmula de Brzycki: `weight * (36/(37-reps))`, con guarda para `reps>=37` |
| `estimateRepMax` | Inversa de Brzycki: peso estimado alcanzable a N reps desde un 1RM conocido |
| `calculateVolume` | Volumen total (peso × reps) de los sets completados |
| `calculatePace` / `calculateSpeed` | Ritmo (s/km) y velocidad (km/h) |
| `roundToNearest` / `calculateSetWeight` | Redondeo al incremento más cercano / porcentaje de un peso base |
| `calculatePlates` | Calculador *greedy* de discos por lado para alcanzar un peso objetivo |

**`dateUtils.ts`** — utilidades de fecha en español (arrays hardcodeados, no `Intl`, por soporte ICU incompleto en Hermes/RN):

| Export | Descripción |
|---|---|
| `formatWorkoutDate` | `YYYY-MM-DD` → "día, D de mes de año" |
| `getWeekRange` | Lunes y domingo ISO de la semana de una fecha |
| `groupWorkoutsByMonth` | Agrupa workouts por etiqueta "Mes Año" |
| `todayISO` | Fecha de hoy como `YYYY-MM-DD` |
| `daysBetween` | Días entre dos fechas ISO |
| `formatFullDate` | "lunes, 7 de julio de 2026" |
| `formatLastUsedLabel` | Hoy/Ayer/Hace N días/`dd-mm-yyyy` |
| `formatShortDate` | "7 jul 2026" |
| `formatDaysAgo` | Etiqueta relativa hoy/ayer/hace N días/sem/mes/año |

**`filterUtils.ts`** — `filterExercises`: búsqueda parcial multi-palabra (cada término debe aparecer en el nombre).

**`personalRecords.ts`** — réplica en JS del trigger SQL `update_personal_record`, para generar PRs offline igual que lo haría el trigger tras sync:
- `PersonalRecordCandidate` (interface) — datos mínimos de un set para evaluar si genera un PR nuevo.
- `PersonalRecordUpdate` (interface) — reps y peso a insertar como nuevo `PersonalRecord`.
- `computePersonalRecordUpdate` (function) — decide si un set completado supera el máximo actual y debería generar un PR. **No filtra `is_warmup`** (deliberado, igual que el trigger SQL).

**`uuid.ts`** — `generateUUID`: UUID v4 cross-platform (web + Hermes/RN vía `expo-crypto`), con fallback manual si no hay `crypto.randomUUID`. Genera el id definitivo desde el insert, incluso offline.

## Tests (219, no documentados con TSDoc — cubiertos por nombre de test)
`exerciseStore.test.ts`, `workoutStore.test.ts`, `exerciseTypeCrud.test.ts`, `routineStore.test.ts`, `calculations.test.ts`, `dateUtils.test.ts`, `schemas.test.ts`, `uuid.test.ts`, `personalRecords.test.ts`, `preferencesStore.test.ts`.
