/**
 * Punto de entrada público de `@fitnotes/database`.
 *
 * Reexporta, en un único módulo:
 * - clientes Supabase (browser/server) y tipos generados de la BD remota;
 * - `SyncEngine` y los repositorios remotos (`createXxxRepository`), usados
 *   por web para todo el CRUD y por mobile solo para analíticas fuera de
 *   alcance offline (stats, historial, backup/CSV);
 * - la mitad "local" (offline): executor SQL agnóstico de plataforma, runner
 *   de migraciones, esquema/lista de tablas sincronizables, identidad local
 *   de invitado/cuenta y los repositorios locales (`createLocalXxxRepository`)
 *   que la UI de mobile usa en su lugar para el resto del CRUD.
 */
export { createBrowserClient, createServerClient } from "./supabase/client.js";
export type { Database } from "./supabase/types.js";
export { SyncEngine } from "./sync/syncEngine.js";
export type { SyncStatus, SyncResult } from "./sync/syncEngine.js";
export { createExerciseRepository } from "./repositories/exerciseRepository.js";
export type { ExerciseRepository } from "./repositories/exerciseRepository.js";
export { createRoutineRepository } from "./repositories/routineRepository.js";
export type { RoutineRepository } from "./repositories/routineRepository.js";
export { createWorkoutRepository } from "./repositories/workoutRepository.js";
export type { WorkoutRepository } from "./repositories/workoutRepository.js";
export { createProgressRepository } from "./repositories/progressRepository.js";
export type { ProgressRepository, ChartPoint } from "./repositories/progressRepository.js";
export { createBodyTrackerRepository } from "./repositories/bodyTrackerRepository.js";
export type { BodyTrackerRepository } from "./repositories/bodyTrackerRepository.js";
export { createCalendarRepository } from "./repositories/calendarRepository.js";
export type { CalendarRepository } from "./repositories/calendarRepository.js";
export { createGoalsRepository } from "./repositories/goalsRepository.js";
export type { GoalsRepository, ExerciseGoalRow } from "./repositories/goalsRepository.js";
export { createBackupRepository, isBackupData } from "./repositories/backupRepository.js";
export type { BackupRepository, BackupData } from "./repositories/backupRepository.js";

// Local (offline) database — no expo-sqlite import here, only the
// platform-agnostic executor interface, schema and migration runner.
export type { SqlExecutor, SqlRunResult } from "./local/sqlExecutor.js";
export { serializeExecutor } from "./local/serializeExecutor.js";
export { runLocalMigrations } from "./local/migrations.js";
export { LOCAL_SCHEMA_STATEMENTS, SYNCABLE_TABLES } from "./local/schema.js";
export type { SyncableTable } from "./local/schema.js";
export { getOrCreateLocalIdentity, setActiveIdentity } from "./local/localIdentity.js";
export type { LocalIdentity } from "./local/localIdentity.js";
export { claimGuestIdentity } from "./sync/claimGuestData.js";
export { createLocalWorkoutRepository } from "./local/repositories/localWorkoutRepository.js";
export type { LocalWorkoutRepository } from "./local/repositories/localWorkoutRepository.js";
export { createLocalExerciseRepository } from "./local/repositories/localExerciseRepository.js";
export type { LocalExerciseRepository } from "./local/repositories/localExerciseRepository.js";
export { createLocalRoutineRepository } from "./local/repositories/localRoutineRepository.js";
export type { LocalRoutineRepository } from "./local/repositories/localRoutineRepository.js";
export { createLocalBodyTrackerRepository } from "./local/repositories/localBodyTrackerRepository.js";
export type { LocalBodyTrackerRepository } from "./local/repositories/localBodyTrackerRepository.js";
export { createLocalGoalsRepository } from "./local/repositories/localGoalsRepository.js";
export type { LocalGoalsRepository } from "./local/repositories/localGoalsRepository.js";
export { createLocalProgressRepository } from "./local/repositories/localProgressRepository.js";
export type { LocalProgressRepository } from "./local/repositories/localProgressRepository.js";
export { createLocalPreferencesRepository } from "./local/repositories/localPreferencesRepository.js";
export type { LocalPreferencesRepository } from "./local/repositories/localPreferencesRepository.js";
export { createLocalCalendarRepository } from "./local/repositories/localCalendarRepository.js";
export type { LocalCalendarRepository } from "./local/repositories/localCalendarRepository.js";
