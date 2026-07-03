import { generateUUID } from "@fitnotes/core";
import type { SqlExecutor } from "../sqlExecutor.js";
import { enqueuePendingOp } from "../pendingOps.js";
import type { Database } from "../../supabase/types.js";
import { nowIso, toBool, fromBool, type RawRow, type RepoError } from "./shared.js";

type MeasurementRow = Database["public"]["Tables"]["body_measurements"]["Row"];
type EntryRow = Database["public"]["Tables"]["body_measurement_entries"]["Row"];

function mapMeasurementRow(row: RawRow): MeasurementRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    unit: row.unit as string,
    goal_type: row.goal_type as MeasurementRow["goal_type"],
    goal_value: (row.goal_value as number | null) ?? null,
    is_default: toBool(row.is_default),
    is_enabled: toBool(row.is_enabled),
    order_index: row.order_index as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapEntryRow(row: RawRow): EntryRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    measurement_id: row.measurement_id as string,
    value: row.value as number,
    comment: (row.comment as string | null) ?? null,
    recorded_at: row.recorded_at as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Repositorio local de body tracker (medidas corporales + registros) —
 * espeja createBodyTrackerRepository() método a método. `exportAllCSV` se
 * queda en el repo remoto (backup, fuera de alcance offline).
 */
export function createLocalBodyTrackerRepository(db: SqlExecutor) {
  return {
    async getMeasurements(): Promise<{ data: MeasurementRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM body_measurements WHERE _deleted = 0 ORDER BY is_enabled DESC, order_index ASC`
      );
      return { data: rows.map(mapMeasurementRow), error: null };
    },

    async reorderMeasurements(
      updates: { id: string; order_index: number }[]
    ): Promise<{ error: RepoError | null }[]> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        for (const { id, order_index } of updates) {
          await db.runAsync(
            `UPDATE body_measurements SET order_index = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
            [order_index, ts, id]
          );
          await enqueuePendingOp(db, "body_measurements", id, "update", { order_index, updated_at: ts });
        }
      });
      return updates.map(() => ({ error: null }));
    },

    async createMeasurement(
      data: {
        name: string;
        unit: string;
        goal_type?: string;
        goal_value?: number | null;
        is_default?: boolean;
        is_enabled?: boolean;
        order_index?: number;
      },
      userId: string
    ): Promise<{ data: MeasurementRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: MeasurementRow = {
        id,
        user_id: userId,
        name: data.name,
        unit: data.unit,
        goal_type: (data.goal_type ?? "INCREASE") as MeasurementRow["goal_type"],
        goal_value: data.goal_value ?? null,
        is_default: data.is_default ?? false,
        is_enabled: data.is_enabled ?? true,
        order_index: data.order_index ?? 0,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO body_measurements (id, user_id, name, unit, goal_type, goal_value, is_default, is_enabled, order_index, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [
            row.id, row.user_id, row.name, row.unit, row.goal_type, row.goal_value,
            fromBool(row.is_default), fromBool(row.is_enabled), row.order_index,
            row.created_at, row.updated_at,
          ]
        );
        await enqueuePendingOp(db, "body_measurements", id, "insert", row);
      });
      return { data: row, error: null };
    },

    async updateMeasurement(
      id: string,
      data: { name?: string; unit?: string; is_enabled?: boolean; goal_type?: string; goal_value?: number | null }
    ): Promise<{ data: MeasurementRow | null; error: RepoError | null }> {
      const ts = nowIso();
      await db.withTransactionAsync(async () => {
        const cols: string[] = [];
        const params: unknown[] = [];
        for (const [key, value] of Object.entries(data)) {
          cols.push(`${key} = ?`);
          params.push(key === "is_enabled" ? fromBool(value as boolean) : value);
        }
        cols.push("updated_at = ?", "_dirty = 1");
        params.push(ts, id);
        await db.runAsync(`UPDATE body_measurements SET ${cols.join(", ")} WHERE id = ?`, params);
        await enqueuePendingOp(db, "body_measurements", id, "update", { ...data, updated_at: ts });
      });
      const row = await db.getFirstAsync<RawRow>(`SELECT * FROM body_measurements WHERE id = ?`, [id]);
      return { data: row ? mapMeasurementRow(row) : null, error: null };
    },

    async deleteMeasurement(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const ts = nowIso();
        // Espeja el ON DELETE CASCADE remoto sobre body_measurement_entries.
        const entries = await db.getAllAsync<RawRow>(
          `SELECT id FROM body_measurement_entries WHERE measurement_id = ? AND _deleted = 0`,
          [id]
        );
        for (const e of entries) {
          const entryId = e.id as string;
          await db.runAsync(`UPDATE body_measurement_entries SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, entryId]);
          await enqueuePendingOp(db, "body_measurement_entries", entryId, "delete", null);
        }
        await db.runAsync(`UPDATE body_measurements SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, id]);
        await enqueuePendingOp(db, "body_measurements", id, "delete", null);
      });
      return { error: null };
    },

    async getEntries(measurementId: string, limit = 50): Promise<{ data: EntryRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM body_measurement_entries WHERE _deleted = 0 AND measurement_id = ? ORDER BY recorded_at DESC LIMIT ?`,
        [measurementId, limit]
      );
      return { data: rows.map(mapEntryRow), error: null };
    },

    async getAllEntries(userId: string): Promise<{ data: EntryRow[]; error: RepoError | null }> {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM body_measurement_entries WHERE _deleted = 0 AND user_id = ? ORDER BY recorded_at DESC`,
        [userId]
      );
      return { data: rows.map(mapEntryRow), error: null };
    },

    async addEntry(
      data: { measurement_id: string; value: number; comment?: string; recorded_at?: string },
      userId: string
    ): Promise<{ data: EntryRow | null; error: RepoError | null }> {
      const id = generateUUID();
      const ts = nowIso();
      const row: EntryRow = {
        id,
        user_id: userId,
        measurement_id: data.measurement_id,
        value: data.value,
        comment: data.comment ?? null,
        recorded_at: data.recorded_at ?? ts,
        created_at: ts,
        updated_at: ts,
      };
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO body_measurement_entries (id, user_id, measurement_id, value, comment, recorded_at, created_at, updated_at, _dirty, _deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [row.id, row.user_id, row.measurement_id, row.value, row.comment, row.recorded_at, row.created_at, row.updated_at]
        );
        await enqueuePendingOp(db, "body_measurement_entries", id, "insert", row);
      });
      return { data: row, error: null };
    },

    async deleteEntry(id: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const ts = nowIso();
        await db.runAsync(`UPDATE body_measurement_entries SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, id]);
        await enqueuePendingOp(db, "body_measurement_entries", id, "delete", null);
      });
      return { error: null };
    },

    async resetMeasurement(measurementId: string): Promise<{ error: RepoError | null }> {
      await db.withTransactionAsync(async () => {
        const ts = nowIso();
        const entries = await db.getAllAsync<RawRow>(
          `SELECT id FROM body_measurement_entries WHERE measurement_id = ? AND _deleted = 0`,
          [measurementId]
        );
        for (const e of entries) {
          const entryId = e.id as string;
          await db.runAsync(`UPDATE body_measurement_entries SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, entryId]);
          await enqueuePendingOp(db, "body_measurement_entries", entryId, "delete", null);
        }
      });
      return { error: null };
    },

    async seedDefaultMeasurementsIfNeeded(userId: string): Promise<{ seeded: boolean }> {
      const existing = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM body_measurements WHERE _deleted = 0 AND user_id = ?`,
        [userId]
      );
      if (existing && existing.count > 0) return { seeded: false };

      const ts = nowIso();
      const defaults = [
        { name: "Peso corporal", unit: "kg", goal_type: "DECREASE", order_index: 0 },
        { name: "Grasa corporal", unit: "%", goal_type: "DECREASE", order_index: 1 },
      ];
      await db.withTransactionAsync(async () => {
        for (const d of defaults) {
          const id = generateUUID();
          const row: MeasurementRow = {
            id,
            user_id: userId,
            name: d.name,
            unit: d.unit,
            goal_type: d.goal_type as MeasurementRow["goal_type"],
            goal_value: null,
            is_default: true,
            is_enabled: true,
            order_index: d.order_index,
            created_at: ts,
            updated_at: ts,
          };
          await db.runAsync(
            `INSERT INTO body_measurements (id, user_id, name, unit, goal_type, goal_value, is_default, is_enabled, order_index, created_at, updated_at, _dirty, _deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [
              row.id, row.user_id, row.name, row.unit, row.goal_type, row.goal_value,
              fromBool(row.is_default), fromBool(row.is_enabled), row.order_index,
              row.created_at, row.updated_at,
            ]
          );
          await enqueuePendingOp(db, "body_measurements", id, "insert", row);
        }
      });
      return { seeded: true };
    },
  };
}

export type LocalBodyTrackerRepository = ReturnType<typeof createLocalBodyTrackerRepository>;
