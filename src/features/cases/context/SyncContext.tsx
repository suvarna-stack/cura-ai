// ============================================================
// Shared iMed sync state — TopNav triggers it, any page can
// react (e.g. Dashboard shows skeleton rows while syncing).
// The provider component lives in SyncProvider.tsx.
// ============================================================
import { createContext, useContext } from "react";
import type { SyncWindow } from "../api/casesService";

type SyncCtxValue = {
  syncing: boolean;
  /** i18n key — render with t(lastSync) */
  lastSync: string;
  /** bumped when a sync finishes successfully — pass into useCases() to refetch */
  syncVersion: number;
  /** no window (or an empty one) pulls everything, as before */
  runSync: (window?: SyncWindow) => void;
  /**
   * Ask before syncing. A sync re-pulls the hospital's records over the
   * dashboard, so every UI trigger goes through here; runSync stays the raw
   * action for anything that has already confirmed.
   */
  requestSync: (window?: SyncWindow) => void;
};

export const SyncCtx = createContext<SyncCtxValue>({
  syncing: false,
  lastSync: "sync.ago2m",
  syncVersion: 0,
  runSync: () => {},
  requestSync: () => {},
});

export const useSync = () => useContext(SyncCtx);
