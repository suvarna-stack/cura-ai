// ============================================================
// SyncProvider — component half of the iMed-sync context.
// The context object and useSync hook live in SyncContext.tsx
// (kept component-free for fast refresh).
// ============================================================
import { useState } from "react";
import { SyncCtx } from "./SyncContext";
import { syncFromHospital, type SyncWindow } from "../api/casesService";

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("sync.ago2m");
  const [syncVersion, setSyncVersion] = useState(0);

  const runSync = (window?: SyncWindow) => {
    if (syncing) return;
    setSyncing(true);
    void (async () => {
      try {
        await syncFromHospital(window);
        setLastSync("sync.justNow");
        setSyncVersion((v) => v + 1);
      } catch {
        setLastSync("sync.failed");
      } finally {
        setSyncing(false);
      }
    })();
  };

  return (
    <SyncCtx.Provider value={{ syncing, lastSync, syncVersion, runSync }}>
      {children}
    </SyncCtx.Provider>
  );
}
