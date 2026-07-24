// ============================================================
// SyncProvider — component half of the iMed-sync context.
// The context object and useSync hook live in SyncContext.tsx
// (kept component-free for fast refresh).
// ============================================================
import { useState } from "react";
import { SyncCtx } from "./SyncContext";

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("sync.ago2m");

  const runSync = () => {
    if (syncing) return;
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setLastSync("sync.justNow");
    }, 2200);
  };

  return (
    <SyncCtx.Provider value={{ syncing, lastSync, runSync }}>
      {children}
    </SyncCtx.Provider>
  );
}
