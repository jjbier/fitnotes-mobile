/**
 * Offline-first sync engine for the mobile app.
 *
 * Strategy: last-write-wins based on updated_at timestamp.
 * Each table has an updated_at column maintained by a DB trigger.
 * The local SQLite store tracks a last_synced_at watermark per table.
 *
 * TODO:
 *  - Implement pushLocalChanges() using expo-sqlite pending queue
 *  - Implement pullRemoteChanges() via Supabase Realtime or polling
 *  - Add network-state listener (NetInfo) to pause/resume sync
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

export type SyncStatus = "idle" | "syncing" | "error";

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
}

export interface ConflictRecord {
  table: string;
  id: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  resolution: "local" | "remote";
}

export class SyncEngine {
  private client: SupabaseClient<Database>;
  private status: SyncStatus = "idle";

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Push locally-created/updated records to Supabase.
   * Reads the local SQLite pending-changes queue and upserts each row.
   * TODO: implement with expo-sqlite pending queue
   */
  async pushLocalChanges(): Promise<number> {
    this.status = "syncing";
    try {
      // TODO: query local SQLite pending_changes table
      // TODO: batch upsert to Supabase, respecting updated_at ordering
      // TODO: clear pushed records from pending_changes
      const pushed = 0;
      return pushed;
    } catch (err) {
      this.status = "error";
      throw err;
    }
  }

  /**
   * Pull changes from Supabase that are newer than our last sync watermark.
   * TODO: implement with last_synced_at watermark stored in AsyncStorage
   */
  async pullRemoteChanges(): Promise<number> {
    this.status = "syncing";
    try {
      // TODO: read last_synced_at from AsyncStorage
      // TODO: query each table for rows where updated_at > last_synced_at
      // TODO: upsert into local SQLite, skipping conflicts handled by resolveConflicts()
      // TODO: update last_synced_at watermark
      const pulled = 0;
      return pulled;
    } catch (err) {
      this.status = "error";
      throw err;
    }
  }

  /**
   * Resolve write conflicts between local and remote versions of a record.
   * Uses last-write-wins: the record with the later updated_at timestamp wins.
   */
  resolveConflicts(
    localUpdatedAt: string,
    remoteUpdatedAt: string
  ): "local" | "remote" {
    return new Date(localUpdatedAt) >= new Date(remoteUpdatedAt)
      ? "local"
      : "remote";
  }

  /** Run a full sync cycle: push then pull. */
  async sync(): Promise<SyncResult> {
    const pushed = await this.pushLocalChanges();
    const pulled = await this.pullRemoteChanges();
    this.status = "idle";
    return { pushed, pulled, conflicts: 0 };
  }
}
