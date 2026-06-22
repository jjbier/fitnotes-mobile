import { createContext, useContext } from "react";
import type { SyncStatus } from "@fitnotes/database";

interface SyncContextValue {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: string | null;
  refetchSignal: number;
}

export const SyncContext = createContext<SyncContextValue>({
  status: "idle",
  pendingCount: 0,
  lastSyncAt: null,
  refetchSignal: 0,
});

export function useSyncStatus(): SyncContextValue {
  return useContext(SyncContext);
}
