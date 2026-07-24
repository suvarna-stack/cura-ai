// ============================================================
// Shared approval state (SRS F14) — the Dashboard and every case
// detail page read/write the same approved-case set, so approving
// from a detail page really moves the case to Finished.
// The provider component lives in ApprovalsProvider.tsx.
// ============================================================
import { createContext, useContext } from "react";

type ApprovalsCtxValue = {
  approvedIds: Set<string>;
  /** Cases reopened but not yet re-approved — they live in the Dashboard's
      Reopen tab. Persisted (localStorage["reopenedCases"]) so a reopen
      survives reload even without a live server; re-approving removes the id. */
  reopenedIds: Set<string>;
  /** bumped when the server confirms a reopen — pass to useCases(casesVersion)
      to trigger a silent refetch of the case lists */
  casesVersion: number;
  approve: (ids: string[]) => void;
  reopen: (id: string) => void;
  /** Live-mode reconciliation (no-op in static mode): drop reopened ids the
      server still reports as finished — e.g. re-approved from another browser
      or a reopen POST that never landed. */
  pruneReopened: (serverFinishedIds: string[]) => void;
};

export const ApprovalsCtx = createContext<ApprovalsCtxValue>({
  approvedIds: new Set<string>(),
  reopenedIds: new Set<string>(),
  casesVersion: 0,
  approve: () => {},
  reopen: () => {},
  pruneReopened: () => {},
});

export const useApprovals = () => useContext(ApprovalsCtx);
