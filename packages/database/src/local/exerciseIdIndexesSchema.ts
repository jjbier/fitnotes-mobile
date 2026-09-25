/**
 * Añade índices que faltaban en `exercise_id` de `workout_exercises` y
 * `routine_day_exercises` (2026-09-25) — sin ellos, cualquier consulta
 * `WHERE exercise_id = ?` sobre esas dos tablas (la cascada de
 * `deleteExercise`, `resyncPersonalRecordsForExercise`, y sobre todo el
 * bucle de `mergeDuplicateCatalogEntries` — una consulta de estas por cada
 * ejercicio duplicado encontrado) hacía un full table scan. Pasaba
 * desapercibido con pocos datos, pero en una cuenta real con historial
 * grande volvía `mergeDuplicateCatalogEntries` (ahora en cada sync, ver
 * CLAUDE.md) e incluso `deleteExercise` perceptiblemente lentos —
 * verificado en dispositivo físico: el botón de backup completo se quedó
 * varios minutos "cargando" mientras una fusión de catálogo con muchos
 * duplicados hacía decenas de full table scans sobre `workout_exercises`.
 */
export const EXERCISE_ID_INDEXES_SCHEMA_STATEMENTS: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise_id ON workout_exercises(exercise_id)`,
  `CREATE INDEX IF NOT EXISTS idx_routine_day_exercises_exercise_id ON routine_day_exercises(exercise_id)`,
];
