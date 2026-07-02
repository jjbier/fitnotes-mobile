# packages/core — @fitnotes/core

_Last updated: 2026-07-02_

**Regla absoluta:** cero imports de `react`, `next`, `expo`, `react-native`. Solo TypeScript puro + zustand + zod + immer.

## Tipos (`src/types/index.ts`)

```
ExerciseType enum  10 valores: WEIGHT_REPS | REPS_ONLY | WEIGHT_ONLY | DISTANCE_TIME | TIME_ONLY
                               WEIGHT_DISTANCE | WEIGHT_TIME | REPS_DISTANCE | REPS_TIME | DISTANCE_ONLY
WeightUnit         "kg" | "lb"

Interfaces: Category, Exercise, Workout, WorkoutExercise, Set,
            PersonalRecord, Routine, RoutineDay, RoutineDayExercise,
            PredefinedSet, BodyMeasurement, BodyMeasurementEntry
```

## Stores
Ver `stores.md` para detalle completo de cada store.

- `useWorkoutStore` — workout activo + historial + sets CRUD
- `useExerciseStore` — catálogo de ejercicios + categorías
- `useProgressStore` — personal records + estimated 1RM
- `useRoutineStore` — rutinas + días + ejercicios por día + predefined sets

## Utils

```ts
calculate1RM(weight, reps)      // Brzycki: weight * (36 / (37 - reps)); guard reps≥37
estimateRepMax(oneRM, reps)
calculateVolume(sets)
calculateSetWeight(base, pct, increment)
calculatePlates(target, bar, plates)
calculatePace(distKm, timeS)    // s/km
calculateSpeed(distKm, timeS)   // km/h
formatWorkoutDate(dateStr)      // "Lun, 16 de junio de 2026" — día/mes en español (arrays hardcodeados, NO Intl — evita problemas de soporte ICU en Hermes/RN)
todayISO()                      // "YYYY-MM-DD"
getWeekRange(dateStr)           // { start, end } lun→dom
groupWorkoutsByMonth(workouts)  // Record<"Month YYYY", Workout[]>
getExerciseFields(type)         // → { showWeight, showReps, showDistance, showTime }
```

## Tests (203 total)

- `exerciseStore.test.ts` — CRUD ejercicios y categorías
- `workoutStore.test.ts` — workout lifecycle, sets, agrupaciones
- `exerciseTypeCrud.test.ts` — CRUD para los 5 ExerciseTypes base
- `routineStore.test.ts` — rutinas y días
- `calculations.test.ts` — calculate1RM, calculatePlates, etc.
- `dateUtils.test.ts` — formatWorkoutDate, getWeekRange, etc.
- `schemas.test.ts` — validación Zod

## Nota — `ChartPoint` duplicado
`progressStore.ts` mantiene su propia interfaz `ChartPoint` (debe coincidir campo a campo con la de `packages/database/src/repositories/progressRepository.ts`: `totalReps`, `totalDistance`, `totalTime`, `maxSpeed`, `bestPace`, `weightByReps`). Al añadir un campo a una, añadirlo también a la otra o falla el type-check.
