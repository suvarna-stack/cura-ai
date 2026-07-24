// ============================================================
// ApprovalsProvider — component half of the approvals context.
// Dual-write: the approved set lives in the browser
// (localStorage["approvedCases"]) for optimistic UI + offline
// mode, AND each action fires POST /cases/approve /
// POST /cases/{id}/reopen at the live server when one is
// configured (VITE_API_BASE). The server writes case_status,
// a coding_history entry (F12) and the limited iMed write-back;
// reopen per F14. Reopened-but-not-re-approved cases live in a
// second persisted set (localStorage["reopenedCases"]) that feeds
// the Dashboard's Reopen tab; a confirmed server reopen bumps
// casesVersion so useCases refetches the moved case without a
// remount.
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { approveCases, reopenCase } from "../api/casesService";
import { ApprovalsCtx } from "./ApprovalsContext";

export function ApprovalsProvider({ children }: { children: React.ReactNode }) {
  const [approvedIds, setApprovedIds] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem("approvedCases") ?? "[]")); }
    catch { return new Set<string>(); }
  });
  useEffect(() => { localStorage.setItem("approvedCases", JSON.stringify([...approvedIds])); }, [approvedIds]);
  // activity-log undo rewrites localStorage["approvedCases"] directly and fires
  // this event so the in-memory set follows without a page reload
  useEffect(() => {
    const reread = () => {
      try { setApprovedIds(new Set<string>(JSON.parse(localStorage.getItem("approvedCases") ?? "[]"))); }
      catch { /* keep current state */ }
    };
    window.addEventListener("approvals:changed", reread);
    return () => window.removeEventListener("approvals:changed", reread);
  }, []);
  // reopened-awaiting-re-approval set — persisted like approvedCases, so a
  // reopen keeps working offline/static. In live mode pruneReopened() yields
  // to the server when it still reports a case as finished.
  const [reopenedIds, setReopenedIds] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem("reopenedCases") ?? "[]")); }
    catch { return new Set<string>(); }
  });
  useEffect(() => { localStorage.setItem("reopenedCases", JSON.stringify([...reopenedIds])); }, [reopenedIds]);
  // reopen POSTs still in flight — pruneReopened must not cancel their
  // optimistic hide against a finished list fetched before the POST landed
  const inFlight = useRef<Set<string>>(new Set());
  const [casesVersion, setCasesVersion] = useState(0);
  const approve = (ids: string[]) => {
    setApprovedIds(prev => new Set([...prev, ...ids]));
    // re-approving a just-reopened case must stop hiding its server row
    setReopenedIds(prev => {
      if (!ids.some(id => prev.has(id))) return prev;
      const n = new Set(prev); ids.forEach(id => n.delete(id)); return n;
    });
    void approveCases(ids); // no-op (false) without a live server
  };
  const reopen = (id: string) => {
    setApprovedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setReopenedIds(prev => new Set(prev).add(id)); // optimistic: into the Reopen tab now
    inFlight.current.add(id);
    reopenCase(id).then(ok => {
      inFlight.current.delete(id);
      if (ok) setCasesVersion(v => v + 1); // server moved it → silent refetch
      // no live server / failed write: the id stays in the persisted set —
      // that IS the static-mode fallback (localStorage wins over fetched data);
      // in live mode the next fetch's pruneReopened self-heals a failed write
    });
  };
  const pruneReopened = useCallback((serverFinishedIds: string[]) => {
    if (!import.meta.env.VITE_API_BASE) return; // static mode: local set is authoritative
    setReopenedIds(prev => {
      const stale = serverFinishedIds.filter(id => prev.has(id) && !inFlight.current.has(id));
      if (stale.length === 0) return prev;
      const n = new Set(prev); stale.forEach(id => n.delete(id)); return n;
    });
  }, []);

  return (
    <ApprovalsCtx.Provider value={{ approvedIds, reopenedIds, casesVersion, approve, reopen, pruneReopened }}>
      {children}
    </ApprovalsCtx.Provider>
  );
}
