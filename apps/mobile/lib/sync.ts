import { SyncEngine } from "@fitnotes/database";
import { supabase } from "./supabase";
import * as FileSystem from "expo-file-system";

export const syncEngine = new SyncEngine(supabase);

const QUEUE_FILE = (FileSystem.documentDirectory ?? "") + "sync-queue.json";

// Load any previously persisted pending operations on startup
(async () => {
  try {
    const content = await FileSystem.readAsStringAsync(QUEUE_FILE);
    const ops = JSON.parse(content) as unknown;
    if (Array.isArray(ops) && ops.length > 0) {
      syncEngine.loadOps(ops);
    }
  } catch {
    // No queue file yet — normal on first run
  }
})();

export async function persistSyncQueue(): Promise<void> {
  try {
    const ops = syncEngine.getPendingOps();
    if (ops.length === 0) {
      await FileSystem.deleteAsync(QUEUE_FILE, { idempotent: true });
    } else {
      await FileSystem.writeAsStringAsync(QUEUE_FILE, JSON.stringify(ops));
    }
  } catch {
    // Ignore write errors — sync still works in-memory
  }
}
