/**
 * Contexto de solo lectura que expone el estado del `SyncEngine` (obtenido en
 * `_layout.tsx`, que es quien orquesta el sync real) al resto de la app, sin
 * que cada pantalla tenga que suscribirse por su cuenta al motor de sync.
 */
import { createContext, useContext } from "react";
import type { SyncStatus } from "@fitnotes/database";

/**
 * Forma del estado de sincronización compartido.
 * - `status`: fase actual del `SyncEngine` (idle/syncing/error, etc.).
 * - `pendingCount`: nº de operaciones aún en la cola durable de `pending_ops`.
 * - `lastSyncAt`: timestamp ISO del último sync completado con éxito, o `null` si nunca sincronizó.
 * - `refetchSignal`: contador que cambia tras cada sync para que las pantallas
 *   con datos ya cargados sepan que deben refrescar (patrón "señal", no boolean,
 *   para poder disparar refrescos repetidos con `useEffect`).
 */
interface SyncContextValue {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: string | null;
  refetchSignal: number;
}

/** Valor por defecto (estado "en reposo", sin datos) usado antes de que `_layout.tsx` provea el real. */
export const SyncContext = createContext<SyncContextValue>({
  status: "idle",
  pendingCount: 0,
  lastSyncAt: null,
  refetchSignal: 0,
});

/** Hook de acceso al estado de sincronización compartido — ver `SyncContextValue`. */
export function useSyncStatus(): SyncContextValue {
  return useContext(SyncContext);
}
