// ============================================================
// Shared iMed sync state — TopNav triggers it, any page can
// react (e.g. Dashboard shows skeleton rows while syncing).
// The provider component lives in SyncProvider.tsx.
// ============================================================
import { createContext, useContext } from "react";

type SyncCtxValue = {
  syncing: boolean;
  /** i18n key — render with t(lastSync) */
  lastSync: string;
  /** bumped when a sync finishes successfully — pass into useCases() to refetch */
  syncVersion: number;
  runSync: () => void;
};

export const SyncCtx = createContext<SyncCtxValue>({
  syncing: false,
  lastSync: "sync.ago2m",
  syncVersion: 0,
  runSync: () => {},
});

export const useSync = () => useContext(SyncCtx);
