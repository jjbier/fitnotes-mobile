/**
 * Repositorio de backup/restauración completa (remoto, solo Supabase) y
 * recálculo de PRs a partir del historial en servidor. Usado por web y por
 * las pantallas de mobile que requieren cuenta real (fuera de alcance offline).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputePersonalRecordLedger, type CompletedSetForPR } from "@fitnotes/core";
import type { Database } from "../supabase/types.js";
import { dedupePersonalRecords, type DedupablePersonalRecord } from "./progressRepository.js";

type Client = SupabaseClient<Database>;
type BackupEntry = Record<string, unknown>;
type PersonalRecordInsert = Database["public"]["Tables"]["personal_records"]["Insert"];

/** Volcado completo de los datos de un usuario, en el formato exportado/importado por el backup JSON. */
export interface BackupData {
  version: number;
  exported_at: string;
  categories: BackupEntry[];
  exercises: BackupEntry[];
  routines: BackupEntry[];
  routine_days: BackupEntry[];
  routine_day_exercises: BackupEntry[];
  predefined_sets: BackupEntry[];
  body_measurements: BackupEntry[];
  body_measurement_entries: BackupEntry[];
  workouts: BackupEntry[];
  workout_exercises: BackupEntry[];
  sets: BackupEntry[];
  personal_records: BackupEntry[];
  exercise_goals: BackupEntry[];
}

/** Type guard mínimo para un JSON de backup: valida versión, `exported_at` y que `workouts` sea array (no valida el resto de tablas). */
export function isBackupData(v: unknown): v is BackupData {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && typeof o.exported_at === "string" && Array.isArray(o.workouts);
}

// Delete in FK-safe order (children before parents)
const DELETE_TABLES = [
  "sets", "workout_exercises", "workouts", "personal_records",
  "predefined_sets", "routine_day_exercises", "routine_days", "routines",
  "body_measurement_entries", "body_measurements",
  "exercise_goals", "exercises", "categories",
] as const;

/** Repositorio de exportación/restauración total de datos y recálculo de PRs, contra las tablas remotas de Supabase. */
export function createBackupRepository(client: Client) {
  return {
    /**
     * Exporta TODAS las tablas de datos del usuario (12 tablas, en paralelo
     * salvo `exercise_goals`) a un único objeto `BackupData` con marca de
     * tiempo. `personal_records` se colapsa con {@link dedupePersonalRecords}
     * antes de exportar: hasta `010_drop_personal_record_trigger.sql`
     * (2026-09-24) esta tabla podía tener dos filas por el mismo PR (ver
     * CLAUDE.md/offline-sync.md), y sin este dedup el `.fitnotes` exportado
     * arrastraba esos duplicados aunque la propia app ya no los muestre.
     */
    async exportBackup(userId: string): Promise<BackupData> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (table: string) => (client.from(table as never) as any).select("*").eq("user_id", userId);
      const [
        { data: cats }, { data: exs }, { data: rts }, { data: rds }, { data: rdes },
        { data: ps }, { data: bms }, { data: bmes }, { data: wos }, { data: wes }, { data: sets }, { data: prs },
      ] = await Promise.all([
        q("categories"), q("exercises"), q("routines"), q("routine_days"), q("routine_day_exercises"),
        q("predefined_sets"), q("body_measurements"), q("body_measurement_entries"),
        q("workouts"), q("workout_exercises"), q("sets"), q("personal_records"),
      ]);
      const { data: egs } = await q("exercise_goals");
      return {
        version: 1, exported_at: new Date().toISOString(),
        categories: cats ?? [], exercises: exs ?? [], routines: rts ?? [],
        routine_days: rds ?? [], routine_day_exercises: rdes ?? [], predefined_sets: ps ?? [],
        body_measurements: bms ?? [], body_measurement_entries: bmes ?? [],
        workouts: wos ?? [], workout_exercises: wes ?? [], sets: sets ?? [],
        personal_records: dedupePersonalRecords((prs ?? []) as DedupablePersonalRecord[]) as unknown as BackupEntry[],
        exercise_goals: egs ?? [],
      };
    },

    /**
     * Restaura un `BackupData` sobrescribiendo TODOS los datos actuales del usuario:
     * primero borra todas las tablas en orden hijos→padres (`DELETE_TABLES`, evita
     * violar FKs), luego inserta en orden padres→hijos por chunks de 500 filas
     * (límite de tamaño de payload de Supabase), forzando `user_id` en cada fila
     * restaurada (por si el backup viene de otra cuenta/export antiguo).
     * `personal_records` se restaura también aquí, deduplicado con
     * {@link dedupePersonalRecords} (por si el backup es de antes de que
     * `exportBackup` empezara a deduplicar): hasta `010_drop_personal_record_trigger.sql`
     * (2026-09-24) esta tabla no se restauraba explícitamente porque el propio
     * trigger la regeneraba como efecto secundario de insertar `sets` — al
     * quitar el trigger eso dejó de pasar, así que sin este paso una
     * restauración perdía todos los PRs. `onStep` permite reportar progreso a
     * la UI; cualquier error aborta lanzando.
     */
    async restoreBackup(userId: string, data: BackupData, onStep?: (message: string) => void): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = (table: string) => client.from(table as never) as any;

      for (const table of DELETE_TABLES) {
        onStep?.(`Eliminando ${table}…`);
        const { error } = await tbl(table).delete().eq("user_id", userId);
        if (error) throw new Error(`Error eliminando ${table}: ${error.message}`);
      }

      const insertSteps: [string, BackupEntry[]][] = [
        ["categories", data.categories],
        ["exercises", data.exercises],
        ["personal_records", dedupePersonalRecords(data.personal_records as unknown as DedupablePersonalRecord[]) as unknown as BackupEntry[]],
        ["routines", data.routines],
        ["routine_days", data.routine_days],
        ["routine_day_exercises", data.routine_day_exercises],
        ["predefined_sets", data.predefined_sets],
        ["body_measurements", data.body_measurements],
        ["body_measurement_entries", data.body_measurement_entries],
        ["workouts", data.workouts],
        ["workout_exercises", data.workout_exercises],
        ["sets", data.sets],
        ["exercise_goals", data.exercise_goals],
      ];
      const CHUNK = 500;
      for (const [table, rows] of insertSteps) {
        if (!rows?.length) continue;
        onStep?.(`Restaurando ${table} (${rows.length})…`);
        const patched = rows.map((r) => ({ ...r, user_id: userId }));
        for (let i = 0; i < patched.length; i += CHUNK) {
          const { error } = await tbl(table).insert(patched.slice(i, i + CHUNK));
          if (error) throw new Error(`Error en ${table}: ${error.message}`);
        }
      }
    },

    /**
     * Borra y regenera desde cero todos los `personal_records` del usuario a
     * partir del historial de sets completos (con peso y reps) en
     * `workout_exercises`, vía {@link recomputePersonalRecordLedger} (mismo
     * cálculo, mismo `achieved_at` real por set, que usa el resto de la app —
     * `resyncPersonalRecordsForExercise` en `workoutRepository.ts`). Antes
     * reimplementaba la regla por su cuenta con dos divergencias reales: no
     * incluía `achieved_at` en el insert (caía al `DEFAULT now()` de la
     * columna, así que un recálculo fechaba TODOS los PRs "hoy" en vez de su
     * fecha real de consecución) y excluía series de calentamiento, mientras
     * que la ruta incremental normal no lo hace (ver `personalRecords.ts`) —
     * un recálculo completo podía dar un conjunto de PRs distinto al que la
     * app genera sola set a set.
     * @returns número de filas de PR insertadas.
     */
    async recalculatePersonalRecords(userId: string): Promise<number> {
      await client.from("personal_records").delete().eq("user_id", userId);

      const { data: weRows } = await client.from("workout_exercises").select("id, exercise_id").eq("user_id", userId);
      if (!weRows?.length) return 0;

      const weIds = weRows.map((we) => we.id);
      const exerciseById = Object.fromEntries(weRows.map((we) => [we.id, we.exercise_id]));

      const { data: setRows } = await client
        .from("sets")
        .select("workout_exercise_id, weight, reps, created_at")
        .in("workout_exercise_id", weIds)
        .eq("is_complete", true)
        .not("weight", "is", null)
        .not("reps", "is", null);

      const completedSets: CompletedSetForPR[] = [];
      for (const s of setRows ?? []) {
        const exerciseId = exerciseById[s.workout_exercise_id];
        if (!exerciseId || s.weight == null || s.reps == null) continue;
        completedSets.push({ exercise_id: exerciseId, weight: s.weight, reps: s.reps, created_at: s.created_at });
      }

      const ledger = recomputePersonalRecordLedger(completedSets);
      if (ledger.length === 0) return 0;

      const records: PersonalRecordInsert[] = ledger.map((e) => ({
        user_id: userId, exercise_id: e.exercise_id, weight: e.weight, reps: e.reps, achieved_at: e.achieved_at,
      }));
      await client.from("personal_records").insert(records);
      return records.length;
    },
  };
}

export type BackupRepository = ReturnType<typeof createBackupRepository>;
