/**
 * Motor de sincronización offline-first.
 *
 * Push: sube las operaciones de la cola local (SQLite, ver pendingOpsQueue.ts)
 * en orden seguro para FKs (pushOrdering.ts), con reintento y backoff
 * exponencial por operación.
 *
 * Pull: descarga por tabla las filas remotas más nuevas que la marca de agua
 * local (watermarks.ts) y las aplica a SQLite (applyRemoteRows.ts). Conflicto:
 * una fila local con cambios sin subir (_dirty=1) siempre gana; si no,
 * last-write-wins por updated_at.
 *
 * Limitación conocida: los borrados remotos son físicos en Postgres (no hay
 * tombstones), así que un pull incremental basado en updated_at no puede
 * detectar que una fila fue borrada en otro dispositivo — solo ve que ya no
 * aparece. Requeriría soft-deletes en Supabase para cerrarse del todo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";
import type { SqlExecutor } from "../local/sqlExecutor.js";
import { SYNCABLE_TABLES } from "../local/schema.js";
import {
  getDueOps,
  getPendingCount,
  hasPendingOpsForRow,
  markOpFailed,
  markOpSucceeded,
  type PendingOpRow,
} from "./pendingOpsQueue.js";
import { sortPendingOpsForPush } from "./pushOrdering.js";
import { pullTableChanges } from "./pullChanges.js";
import { applyRemoteRows } from "./applyRemoteRows.js";
import { getWatermark, setWatermark } from "./watermarks.js";

export type SyncStatus = "idle" | "syncing" | "error";

export interface SyncResult {
  pushed: number;
  pushFailed: number;
  pulled: number;
  /** Tablas que recibieron filas nuevas en el último pull. */
  changedTables: Set<string>;
}

export class SyncEngine {
  private client: SupabaseClient<Database>;
  private db: SqlExecutor;
  private status: SyncStatus = "idle";

  constructor(client: SupabaseClient<Database>, db: SqlExecutor) {
    this.client = client;
    this.db = db;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  async getPendingCount(): Promise<number> {
    return getPendingCount(this.db);
  }

  /** Sube las operaciones pendientes que no están en backoff, en orden seguro para FKs. */
  async pushLocalChanges(): Promise<{ pushed: number; failed: number }> {
    const dueOps = await getDueOps(this.db);
    if (dueOps.length === 0) return { pushed: 0, failed: 0 };

    this.status = "syncing";
    const ordered = sortPendingOpsForPush(dueOps);
    let pushed = 0;
    let failed = 0;

    for (const op of ordered) {
      try {
        await this.executeOperation(op);
        await markOpSucceeded(this.db, op.id);
        await this.clearDirtyIfFullyPushed(op);
        pushed++;
      } catch (err) {
        await markOpFailed(this.db, op.id, op.attempts, err instanceof Error ? err.message : String(err));
        failed++;
      }
    }

    this.status = failed > 0 ? "error" : "idle";
    return { pushed, failed };
  }

  /** Descarga cambios remotos por tabla desde la última marca de agua y los aplica localmente. */
  async pullRemoteChanges(userId: string): Promise<{ pulled: number; changedTables: Set<string> }> {
    this.status = "syncing";
    let pulled = 0;
    const changedTables = new Set<string>();

    try {
      for (const table of SYNCABLE_TABLES) {
        const since = await getWatermark(this.db, table);
        const rows = await pullTableChanges(this.client, table, userId, since);
        if (rows.length === 0) continue;

        await applyRemoteRows(this.db, table, rows);
        pulled += rows.length;
        changedTables.add(table);

        const maxUpdatedAt = rows.reduce<string>(
          (max, r) => ((r.updated_at as string) > max ? (r.updated_at as string) : max),
          since ?? ""
        );
        await setWatermark(this.db, table, maxUpdatedAt || new Date().toISOString());
      }
      this.status = "idle";
    } catch {
      this.status = "error";
    }

    return { pulled, changedTables };
  }

  /** Ciclo completo: push primero (para no pisar ediciones locales con el pull), luego pull. */
  async sync(userId: string): Promise<SyncResult> {
    const pushResult = await this.pushLocalChanges();
    const pullResult = await this.pullRemoteChanges(userId);
    this.status = "idle";
    return {
      pushed: pushResult.pushed,
      pushFailed: pushResult.failed,
      pulled: pullResult.pulled,
      changedTables: pullResult.changedTables,
    };
  }

  private async executeOperation(op: PendingOpRow): Promise<void> {
    const { table_name, op_type, row_id, payload } = op;
    const data = payload ? (JSON.parse(payload) as Record<string, unknown>) : null;
    const table = table_name as never;

    let result: { error: unknown };
    if (op_type === "insert") {
      result = await (this.client.from(table) as ReturnType<typeof this.client.from>).insert(data as never);
    } else if (op_type === "update") {
      result = await (this.client.from(table) as ReturnType<typeof this.client.from>)
        .update(data as never)
        .eq("id", row_id);
    } else {
      result = await (this.client.from(table) as ReturnType<typeof this.client.from>).delete().eq("id", row_id);
    }

    // Supabase resolves with { data, error } instead of throwing — without this
    // check, a real network/RLS failure would be silently treated as success.
    if (result.error) {
      const message = (result.error as { message?: string })?.message ?? "unknown error";
      throw new Error(message);
    }
  }

  /**
   * Tras un push exitoso: si era un delete, purga el tombstone local; si no,
   * limpia _dirty. Solo si no quedan más operaciones pendientes para esa fila
   * (podría haberse encolado una edición nueva mientras el push estaba en curso) —
   * sin esto, una fila nunca dejaría de estar "dirty" y el pull jamás la
   * actualizaría de nuevo, ni siquiera con sus propios cambios ya subidos.
   */
  private async clearDirtyIfFullyPushed(op: PendingOpRow): Promise<void> {
    const stillPending = await hasPendingOpsForRow(this.db, op.table_name, op.row_id);
    if (stillPending) return;

    if (op.op_type === "delete") {
      await this.db.runAsync(`DELETE FROM ${op.table_name} WHERE id = ?`, [op.row_id]);
    } else {
      await this.db.runAsync(`UPDATE ${op.table_name} SET _dirty = 0 WHERE id = ?`, [op.row_id]);
    }
  }
}
