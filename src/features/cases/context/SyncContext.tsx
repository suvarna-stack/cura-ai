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
  /**
   * With a window: pull that period's visits — the only way NEW cases arrive.
   * Without one: re-read the open cases already on the dashboard (the
   * hospital API has no "list every visit" route, per its 2026-11-04 guide).
   */
  runSync: (window?: SyncWindow) => void;
  /**
   * Ask before syncing. A sync re-pulls the hospital's records over the
   * dashboard, so every UI trigger goes through here; runSync stays the raw
   * action for anything that has already confirmed.
   */
  requestSync: (window?: SyncWindow) => void;
  /**
   * Open the sync-period picker — the first step of every UI-started sync.
   * `allowRefresh: false` hides the "update cases already here" choice, for
   * an empty dashboard where there is nothing to update.
   */
  openSyncPicker: (opts?: { allowRefresh?: boolean }) => void;
};

export const SyncCtx = createContext<SyncCtxValue>({
  syncing: false,
  lastSync: "sync.ago2m",
  syncVersion: 0,
  runSync: () => {},
  requestSync: () => {},
  openSyncPicker: () => {},
});

export const useSync = () => useContext(SyncCtx);
