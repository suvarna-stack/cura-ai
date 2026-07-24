// ============================================================
// Shared iMed sync state — TopNav triggers it, any page can
// react (e.g. Dashboard shows skeleton rows while syncing).
// [POC] fake 2.2s delay; real system: call the sync endpoint,
// resolve on completion, and surface "+N new cases" on fold-out.
// The provider component lives in SyncProvider.tsx.
// ============================================================
import { createContext, useContext } from "react";

type SyncCtxValue = {
  syncing: boolean;
  /** i18n key — render with t(lastSync) */
  lastSync: string;
  runSync: () => void;
};

export const SyncCtx = createContext<SyncCtxValue>({
  syncing: false,
  lastSync: "sync.ago2m",
  runSync: () => {},
});

export const useSync = () => useContext(SyncCtx);
