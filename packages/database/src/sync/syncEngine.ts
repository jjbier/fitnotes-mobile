/**
 * Offline-first sync engine for the mobile app.
 *
 * Strategy: last-write-wins based on updated_at timestamp.
 * Each table has an updated_at column maintained by a DB trigger.
 * Uses an in-memory pending queue (expo-sqlite not yet installed).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

export type SyncStatus = "idle" | "syncing" | "error";

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: ConflictRecord[];
  /** Tables that had remote changes during the last pull. */
  changedTables: Set<string>;
}

export interface ConflictRecord {
  table: string;
  id: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  resolution: "local" | "remote";
}

export interface PendingOperation {
  table: string;
  type: "insert" | "update" | "delete";
  data?: Record<string, unknown>;
  id?: string;
  timestamp: string;
}

const SYNCABLE_TABLES = [
  "workouts",
  "workout_exercises",
  "sets",
  "categories",
  "exercises",
  "routines",
  "routine_days",
  "routine_day_exercises",
  "predefined_sets",
] as const;

export class SyncEngine {
  private client: SupabaseClient<Database>;
  private pendingOps: PendingOperation[] = [];
  private status: SyncStatus = "idle";

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  getPendingCount(): number {
    return this.pendingOps.length;
  }

  getPendingOps(): PendingOperation[] {
    return [...this.pendingOps];
  }

  loadOps(ops: PendingOperation[]): void {
    this.pendingOps = [...ops];
  }

  /** Add an operation to the local pending queue for later sync. */
  queueOperation(op: PendingOperation): void {
    this.pendingOps.push(op);
  }

  /**
   * Push all pending local operations to Supabase.
   * Uses last-write-wins: each op is applied in timestamp order.
   * Failed ops are kept in the queue for the next sync cycle.
   */
  async pushLocalChanges(): Promise<SyncResult> {
    if (this.pendingOps.length === 0) {
      return { pushed: 0, pulled: 0, conflicts: [], changedTables: new Set() };
    }

    this.status = "syncing";
    let pushed = 0;
    const failed: PendingOperation[] = [];

    // Sort by timestamp so oldest changes are applied first
    const sorted = [...this.pendingOps].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    for (const op of sorted) {
      try {
        await this.executeOperation(op);
        pushed++;
      } catch {
        failed.push(op);
      }
    }

    this.pendingOps = failed;
    this.status = failed.length > 0 ? "error" : "idle";
    return { pushed, pulled: 0, conflicts: [], changedTables: new Set() };
  }

  /**
   * Pull remote changes newer than the given watermark timestamp.
   * Returns the count of rows pulled — callers are responsible for
   * updating their local stores with the returned data.
   */
  async pullRemoteChanges(since?: string): Promise<SyncResult> {
    this.status = "syncing";
    try {
      let pulled = 0;
      const changedTables = new Set<string>();

      for (const table of SYNCABLE_TABLES) {
        // Build query — reassign to apply the since filter correctly
        let query = this.client
          .from(table)
          .select("id", { count: "exact", head: true }) as ReturnType<typeof this.client.from>;

        if (since) {
          query = (query as unknown as { gt: (col: string, val: string) => typeof query })
            .gt("updated_at", since) as unknown as ReturnType<typeof this.client.from>;
        }

        const { count, error } = await (query as unknown as Promise<{ count: number | null; error: unknown }>);
        if (!error && count && count > 0) {
          pulled += count;
          changedTables.add(table);
        }
      }

      this.status = "idle";
      return { pushed: 0, pulled, conflicts: [], changedTables };
    } catch {
      this.status = "error";
      return { pushed: 0, pulled: 0, conflicts: [], changedTables: new Set() };
    }
  }

  /**
   * Resolve a write conflict between local and remote versions.
   * Uses last-write-wins: the record with the later updated_at wins.
   */
  resolveConflicts(
    localUpdatedAt: string,
    remoteUpdatedAt: string
  ): "local" | "remote" {
    return new Date(localUpdatedAt) >= new Date(remoteUpdatedAt)
      ? "local"
      : "remote";
  }

  /** Run a full sync cycle: push local changes, then pull remote changes. */
  async sync(since?: string): Promise<SyncResult> {
    const pushResult = await this.pushLocalChanges();
    const pullResult = await this.pullRemoteChanges(since);
    this.status = "idle";
    return {
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      conflicts: [...pushResult.conflicts, ...pullResult.conflicts],
      changedTables: pullResult.changedTables,
    };
  }

  private async executeOperation(op: PendingOperation): Promise<void> {
    const { table, type, data, id } = op;
    if (type === "insert") {
      await (this.client.from(table as never) as ReturnType<typeof this.client.from>).insert(data as never);
    } else if (type === "update" && id) {
      await (this.client.from(table as never) as ReturnType<typeof this.client.from>).update(data as never).eq("id", id);
    } else if (type === "delete" && id) {
      await (this.client.from(table as never) as ReturnType<typeof this.client.from>).delete().eq("id", id);
    }
  }
}
