import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;
type BackupEntry = Record<string, unknown>;

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

export function createBackupRepository(client: Client) {
  return {
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
        personal_records: prs ?? [], exercise_goals: egs ?? [],
      };
    },

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

    async recalculatePersonalRecords(userId: string): Promise<number> {
      await client.from("personal_records").delete().eq("user_id", userId);

      const { data: weRows } = await client.from("workout_exercises").select("id, exercise_id");
      if (!weRows?.length) return 0;

      const weIds = weRows.map((we) => we.id);
      const exerciseById = Object.fromEntries(weRows.map((we) => [we.id, we.exercise_id]));

      const { data: setRows } = await client
        .from("sets")
        .select("workout_exercise_id, weight, reps")
        .in("workout_exercise_id", weIds)
        .eq("is_complete", true)
        .eq("is_warmup", false)
        .not("weight", "is", null)
        .not("reps", "is", null);

      const prMap: Record<string, Record<number, number>> = {};
      for (const s of setRows ?? []) {
        const exId = exerciseById[s.workout_exercise_id];
        if (!exId || s.weight == null || s.reps == null) continue;
        if (!prMap[exId]) prMap[exId] = {};
        if (!prMap[exId][s.reps] || s.weight > prMap[exId][s.reps]!) {
          prMap[exId][s.reps] = s.weight;
        }
      }

      const records: { exercise_id: string; reps: number; weight: number; user_id: string }[] = [];
      for (const [exerciseId, repMap] of Object.entries(prMap)) {
        for (const [reps, weight] of Object.entries(repMap)) {
          records.push({ exercise_id: exerciseId, reps: Number(reps), weight, user_id: userId });
        }
      }
      if (records.length > 0) {
        await client.from("personal_records").insert(records);
      }
      return records.length;
    },
  };
}

export type BackupRepository = ReturnType<typeof createBackupRepository>;
