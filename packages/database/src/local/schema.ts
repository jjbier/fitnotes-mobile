/**
 * Esquema SQLite local — espeja el esquema real de Supabase (ver
 * supabase/types.ts, fuente de verdad; las migraciones 001-007 documentan
 * el histórico). Cada tabla sincronizable añade dos columnas de control:
 * `_dirty` (cambios locales sin subir) y `_deleted` (tombstone — no se
 * borra físicamente hasta confirmar el push, para que un pull concurrente
 * no "resucite" el borrado).
 */

const CONTROL_COLUMNS = `
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0
`;

export const LOCAL_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category_id TEXT,
    name TEXT NOT NULL,
    notes TEXT,
    type TEXT NOT NULL,
    weight_unit TEXT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    weight_increment REAL,
    default_rest_seconds INTEGER,
    default_chart TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    comment TEXT,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS workout_exercises (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workout_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    group_id TEXT,
    group_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workout_exercise_id TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    weight REAL,
    reps INTEGER,
    distance REAL,
    time_seconds INTEGER,
    is_complete INTEGER NOT NULL DEFAULT 0,
    is_warmup INTEGER NOT NULL DEFAULT 0,
    comment TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS personal_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    achieved_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS routine_days (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    routine_id TEXT NOT NULL,
    name TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS routine_day_exercises (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    routine_day_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    group_id TEXT,
    group_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS predefined_sets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    routine_day_exercise_id TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    weight REAL,
    reps INTEGER,
    distance REAL,
    time_seconds INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS body_measurements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    goal_type TEXT NOT NULL,
    goal_value REAL,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS body_measurement_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    measurement_id TEXT NOT NULL,
    value REAL NOT NULL,
    comment TEXT,
    recorded_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  `CREATE TABLE IF NOT EXISTS exercise_goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    target_weight REAL,
    target_reps INTEGER,
    target_date TEXT,
    achieved_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ${CONTROL_COLUMNS}
  )`,

  // Índices para las lecturas más frecuentes (por usuario y por FK padre)
  `CREATE INDEX IF NOT EXISTS idx_exercises_user ON exercises(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise ON sets(workout_exercise_id)`,
  `CREATE INDEX IF NOT EXISTS idx_personal_records_exercise ON personal_records(exercise_id)`,
  `CREATE INDEX IF NOT EXISTS idx_routine_days_routine ON routine_days(routine_id)`,
  `CREATE INDEX IF NOT EXISTS idx_routine_day_exercises_day ON routine_day_exercises(routine_day_id)`,
  `CREATE INDEX IF NOT EXISTS idx_predefined_sets_rde ON predefined_sets(routine_day_exercise_id)`,
  `CREATE INDEX IF NOT EXISTS idx_body_measurement_entries_measurement ON body_measurement_entries(measurement_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exercise_goals_exercise ON exercise_goals(exercise_id)`,
];

export const SYNCABLE_TABLES = [
  "categories",
  "exercises",
  "workouts",
  "workout_exercises",
  "sets",
  "personal_records",
  "routines",
  "routine_days",
  "routine_day_exercises",
  "predefined_sets",
  "body_measurements",
  "body_measurement_entries",
  "exercise_goals",
] as const;

export type SyncableTable = (typeof SYNCABLE_TABLES)[number];
