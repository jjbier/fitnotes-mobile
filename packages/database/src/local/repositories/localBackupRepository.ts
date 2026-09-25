/**
 * Repositorio local de backup/restauración completa y recálculo de PRs —
 * réplica de `packages/database/src/repositories/backupRepository.ts` (mismo
 * shape `BackupData`, mismo formato de fichero `.fitnotes`, intercambiable
 * con el remoto). Hasta 2026-09-25 estas tres operaciones eran remote-only
 * "de verdad" (gateadas con `requireAccount()` en `settings.tsx`) — no por
 * ninguna limitación técnica, simplemente no se habían migrado a local
 * todavía (igual que export/import CSV hasta 2026-09-22).
 */
import type { SqlExecutor } from "../sqlExecutor.js";
import { enqueuePendingOp } from "../pendingOps.js";
import { SYNCABLE_TABLES, type SyncableTable } from "../schema.js";
import { nowIso, toBool, fromBool, type RawRow, type RepoError } from "./shared.js";
import { createLocalProgressRepository } from "./localProgressRepository.js";
import { resyncPersonalRecordsForExercise } from "./localWorkoutRepository.js";
import { dedupePersonalRecords, type DedupablePersonalRecord } from "../../repositories/progressRepository.js";
import type { BackupData } from "../../repositories/backupRepository.js";

type BackupEntry = Record<string, unknown>;

/** Columnas reales de cada tabla sincronizable (sin `_dirty`/`_deleted`) y cuáles son booleanas (INTEGER 0/1 en SQLite, boolean en el JSON del backup). */
const TABLE_SPECS: Record<SyncableTable, { columns: string[]; boolColumns?: string[] }> = {
  categories: { columns: ["id", "user_id", "name", "color", "order_index", "created_at", "updated_at"] },
  exercises: {
    columns: ["id", "user_id", "category_id", "name", "notes", "type", "weight_unit", "is_favorite", "weight_increment", "default_rest_seconds", "default_chart", "demo_url", "created_at", "updated_at"],
    boolColumns: ["is_favorite"],
  },
  workouts: { columns: ["id", "user_id", "date", "comment", "start_time", "end_time", "duration_minutes", "created_at", "updated_at"] },
  workout_exercises: { columns: ["id", "user_id", "workout_id", "exercise_id", "order_index", "group_id", "group_name", "created_at", "updated_at"] },
  sets: {
    columns: ["id", "user_id", "workout_exercise_id", "order_index", "weight", "reps", "distance", "time_seconds", "is_complete", "is_warmup", "comment", "created_at", "updated_at"],
    boolColumns: ["is_complete", "is_warmup"],
  },
  personal_records: { columns: ["id", "user_id", "exercise_id", "weight", "reps", "achieved_at", "created_at", "updated_at"] },
  routines: { columns: ["id", "user_id", "name", "notes", "created_at", "updated_at"] },
  routine_days: { columns: ["id", "user_id", "routine_id", "name", "order_index", "created_at", "updated_at"] },
  routine_day_exercises: { columns: ["id", "user_id", "routine_day_id", "exercise_id", "order_index", "group_id", "group_name", "created_at", "updated_at"] },
  predefined_sets: { columns: ["id", "user_id", "routine_day_exercise_id", "order_index", "weight", "reps", "distance", "time_seconds", "created_at", "updated_at"] },
  body_measurements: {
    columns: ["id", "user_id", "name", "unit", "goal_type", "goal_value", "is_default", "is_enabled", "order_index", "created_at", "updated_at"],
    boolColumns: ["is_default", "is_enabled"],
  },
  body_measurement_entries: { columns: ["id", "user_id", "measurement_id", "value", "comment", "recorded_at", "created_at", "updated_at"] },
  exercise_goals: { columns: ["id", "user_id", "exercise_id", "target_weight", "target_reps", "target_date", "achieved_at", "notes", "created_at", "updated_at"] },
};

/** Orden de borrado FK-safe (hijos antes que padres) — igual que `DELETE_TABLES` en el `backupRepository.ts` remoto. */
const DELETE_ORDER: SyncableTable[] = [
  "sets", "workout_exercises", "workouts", "personal_records",
  "predefined_sets", "routine_day_exercises", "routine_days", "routines",
  "body_measurement_entries", "body_measurements",
  "exercise_goals", "exercises", "categories",
];

/** Orden de inserción FK-safe (padres antes que hijos) — igual que `insertSteps` en el `backupRepository.ts` remoto. */
const INSERT_ORDER: SyncableTable[] = [
  "categories", "exercises", "personal_records", "routines", "routine_days",
  "routine_day_exercises", "predefined_sets", "body_measurements",
  "body_measurement_entries", "workouts", "workout_exercises", "sets", "exercise_goals",
];

/** Quita `_dirty`/`_deleted` de una fila cruda y convierte sus columnas booleanas (0/1) a JS boolean, para que el JSON exportado tenga el mismo shape que produce el backup remoto. */
function toBackupEntry(row: RawRow, boolColumns?: string[]): BackupEntry {
  const { _dirty, _deleted, ...rest } = row;
  void _dirty;
  void _deleted;
  if (boolColumns) {
    for (const col of boolColumns) {
      if (col in rest) rest[col] = toBool(rest[col]);
    }
  }
  return rest;
}

/** Tombstona TODAS las filas vivas de una tabla (borrado masivo de {@link restoreBackup}) — un `pending_op` de delete por fila. */
async function tombstoneAllRows(db: SqlExecutor, table: SyncableTable, ts: string): Promise<void> {
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table} WHERE _deleted = 0`);
  for (const row of rows) {
    await db.runAsync(`UPDATE ${table} SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, row.id]);
    await enqueuePendingOp(db, table, row.id, "delete", null);
  }
}

/** Inserta una fila de backup en `table`, forzando `user_id` y `_dirty = 1`, y encola el insert — mismo patrón que cualquier `createXxx` de los repos locales. */
async function insertBackupRow(
  db: SqlExecutor,
  table: SyncableTable,
  entry: BackupEntry,
  userId: string,
  ts: string
): Promise<void> {
  const spec = TABLE_SPECS[table];
  const row: BackupEntry = { ...entry, user_id: userId, created_at: entry.created_at ?? ts, updated_at: entry.updated_at ?? ts };
  const columns = spec.columns;
  const values = columns.map((col) => {
    const v = row[col];
    if (spec.boolColumns?.includes(col)) return fromBool(v as boolean | undefined);
    return v ?? null;
  });
  await db.runAsync(
    `INSERT INTO ${table} (${columns.join(", ")}, _dirty, _deleted) VALUES (${columns.map(() => "?").join(", ")}, 1, 0)`,
    values
  );
  const payload: Record<string, unknown> = {};
  for (const col of columns) payload[col] = row[col] ?? null;
  await enqueuePendingOp(db, table, row.id as string, "insert", payload);
}

/**
 * Repositorio local de backup/restauración/recálculo de PRs — espeja
 * `createBackupRepository()` método a método, mismo shape `BackupData`.
 */
export function createLocalBackupRepository(db: SqlExecutor) {
  return {
    /**
     * Exporta TODAS las tablas de datos vivas (13 tablas sincronizables) a un
     * único objeto `BackupData` con marca de tiempo — mismo shape exacto que
     * el backup remoto, intercambiable entre los dos. `personal_records` se
     * lee vía `getAllPersonalRecords()` (ya deduplicado, ver
     * `localProgressRepository.ts`) en vez de `SELECT *` directo.
     */
    async exportBackup(): Promise<BackupData> {
      const tables = {} as Record<Exclude<SyncableTable, "personal_records">, BackupEntry[]>;
      for (const table of SYNCABLE_TABLES) {
        if (table === "personal_records") continue;
        const rows = await db.getAllAsync<RawRow>(`SELECT * FROM ${table} WHERE _deleted = 0`);
        tables[table] = rows.map((r) => toBackupEntry(r, TABLE_SPECS[table].boolColumns));
      }

      const progressRepo = createLocalProgressRepository(db);
      const { data: personalRecords } = await progressRepo.getAllPersonalRecords();

      return {
        version: 1,
        exported_at: nowIso(),
        categories: tables.categories,
        exercises: tables.exercises,
        routines: tables.routines,
        routine_days: tables.routine_days,
        routine_day_exercises: tables.routine_day_exercises,
        predefined_sets: tables.predefined_sets,
        body_measurements: tables.body_measurements,
        body_measurement_entries: tables.body_measurement_entries,
        workouts: tables.workouts,
        workout_exercises: tables.workout_exercises,
        sets: tables.sets,
        personal_records: personalRecords as unknown as BackupEntry[],
        exercise_goals: tables.exercise_goals,
      };
    },

    /**
     * Restaura un `BackupData` sobrescribiendo TODOS los datos locales
     * actuales: tombstona (no borra físicamente — hace falta el `pending_op`
     * de delete para propagar a Supabase) todas las tablas en orden
     * hijos→padres, luego inserta el contenido del backup en orden
     * padres→hijos, forzando `user_id` en cada fila (por si el backup es de
     * otra cuenta/export antiguo). `personal_records` se deduplica antes de
     * insertar por si el `.fitnotes` es de antes de que `exportBackup`
     * (local o remoto) empezara a deduplicar. Todo en una única transacción.
     */
    async restoreBackup(userId: string, data: BackupData, onStep?: (message: string) => void): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const ts = nowIso();

        for (const table of DELETE_ORDER) {
          onStep?.(`Eliminando ${table}…`);
          await tombstoneAllRows(db, table, ts);
        }

        const dataByTable: Record<SyncableTable, BackupEntry[]> = {
          categories: data.categories,
          exercises: data.exercises,
          personal_records: dedupePersonalRecords(data.personal_records as unknown as DedupablePersonalRecord[]) as unknown as BackupEntry[],
          routines: data.routines,
          routine_days: data.routine_days,
          routine_day_exercises: data.routine_day_exercises,
          predefined_sets: data.predefined_sets,
          body_measurements: data.body_measurements,
          body_measurement_entries: data.body_measurement_entries,
          workouts: data.workouts,
          workout_exercises: data.workout_exercises,
          sets: data.sets,
          exercise_goals: data.exercise_goals,
        };

        for (const table of INSERT_ORDER) {
          const rows = dataByTable[table];
          if (!rows?.length) continue;
          onStep?.(`Restaurando ${table} (${rows.length})…`);
          for (const entry of rows) {
            await insertBackupRow(db, table, entry, userId, ts);
          }
        }
      });
      return { error: null };
    },

    /**
     * Borra y regenera desde cero todos los `personal_records` vigentes a
     * partir de los sets vivos, vía {@link resyncPersonalRecordsForExercise}
     * (mismo cálculo — `recomputePersonalRecordLedger` — que usa el resto de
     * la app: `achieved_at` real por set, sin excluir calentamientos). A
     * diferencia de `repairOrphanedPersonalRecords` (reparación de un solo
     * uso que solo repone ejercicios que ya tenían alguna fila de PR), este
     * recorre TODOS los ejercicios con al menos un set completo con peso y
     * reps además de los que ya tuvieran PRs — es el botón "Recalcular PRs"
     * de Configuración. Ambas consultas exigen `exercises._deleted = 0`: a
     * diferencia de Supabase (donde borrar un ejercicio es un DELETE físico
     * con cascada), local tombstona — así que un `workout_exercises` o
     * `personal_records` puede seguir apuntando por id a un ejercicio ya
     * tombstonado (p.ej. uno fusionado por `mergeDuplicateCatalogEntries`)
     * sin que la fila en sí esté borrada; generar un PR para ese id rompería
     * la FK al subirlo a Supabase (`personal_records_exercise_id_fkey`), que
     * ya no tiene esa fila.
     * @returns número de filas de PR vigentes tras el recálculo.
     */
    async recalculatePersonalRecords(userId: string): Promise<{ data: number; error: RepoError | null }> {
      let count = 0;
      await db.withTransactionAsync(async () => {
        // Purga PRs ya huérfanos de antes de este fix (referencian un
        // exercise_id tombstonado): su insert pending_op nunca pudo llegar a
        // existir en remoto (la FK lo rechaza), así que se borran en duro sin
        // encolar nada — no hay nada que decirle a Supabase de una fila que
        // nunca tuvo. Se purga también el pending_op original para que deje
        // de reintentarse indefinidamente.
        const orphaned = await db.getAllAsync<{ id: string }>(
          `SELECT pr.id as id FROM personal_records pr
           LEFT JOIN exercises ex ON ex.id = pr.exercise_id AND ex._deleted = 0
           WHERE pr._deleted = 0 AND ex.id IS NULL`
        );
        for (const row of orphaned) {
          await db.runAsync(`DELETE FROM pending_ops WHERE table_name = 'personal_records' AND row_id = ?`, [row.id]);
          await db.runAsync(`DELETE FROM personal_records WHERE id = ?`, [row.id]);
        }

        const withQualifyingSets = await db.getAllAsync<{ exercise_id: string }>(
          `SELECT DISTINCT we.exercise_id as exercise_id
           FROM sets s
           JOIN workout_exercises we ON we.id = s.workout_exercise_id
           JOIN exercises ex ON ex.id = we.exercise_id AND ex._deleted = 0
           WHERE we._deleted = 0 AND s._deleted = 0
             AND s.is_complete = 1 AND s.weight IS NOT NULL AND s.reps IS NOT NULL`
        );
        const withExistingPRs = await db.getAllAsync<{ exercise_id: string }>(
          `SELECT DISTINCT pr.exercise_id as exercise_id
           FROM personal_records pr
           JOIN exercises ex ON ex.id = pr.exercise_id AND ex._deleted = 0
           WHERE pr._deleted = 0`
        );
        const exerciseIds = new Set([
          ...withQualifyingSets.map((r) => r.exercise_id),
          ...withExistingPRs.map((r) => r.exercise_id),
        ]);
        for (const exerciseId of exerciseIds) {
          await resyncPersonalRecordsForExercise(db, exerciseId, userId);
        }
        const countRow = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM personal_records WHERE _deleted = 0`
        );
        count = countRow?.count ?? 0;
      });
      return { data: count, error: null };
    },
  };
}

/** Tipo del repositorio devuelto por {@link createLocalBackupRepository}. */
export type LocalBackupRepository = ReturnType<typeof createLocalBackupRepository>;
