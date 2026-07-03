import { SyncEngine } from "@fitnotes/database";
import { supabase } from "./supabase";
import { getLocalDb } from "./db/client";

let enginePromise: Promise<SyncEngine> | null = null;

/** Motor de sync compartido — la cola de pendientes vive en SQLite, no hace falta persistirla aparte. */
export function getSyncEngine(): Promise<SyncEngine> {
  if (!enginePromise) {
    enginePromise = getLocalDb().then((db) => new SyncEngine(supabase, db));
  }
  return enginePromise;
}
