/**
 * Acceso al singleton de `SyncEngine` (de `@fitnotes/database`) para mobile,
 * conectado al cliente Supabase real y a la DB local compartida.
 */
import { SyncEngine } from "@fitnotes/database";
import { supabase } from "./supabase";
import { getLocalDb } from "./db/client";

let enginePromise: Promise<SyncEngine> | null = null;

/**
 * Motor de sync compartido — la cola de pendientes vive en SQLite, no hace falta persistirla aparte.
 *
 * Construye el `SyncEngine` una sola vez (memoizado en `enginePromise`) contra
 * el mismo `SqlExecutor` que usan los repos locales y el cliente Supabase de
 * `./supabase`. No arranca el sync por sí solo mientras la identidad activa
 * sea invitado — eso lo decide quien orquesta el sync (p.ej. `SyncContext` /
 * `useNetworkStatus`), no este módulo.
 */
export function getSyncEngine(): Promise<SyncEngine> {
  if (!enginePromise) {
    enginePromise = getLocalDb().then((db) => new SyncEngine(supabase, db));
  }
  return enginePromise;
}
