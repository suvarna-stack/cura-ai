// ============================================================
// ApprovalsProvider — component half of the approvals context.
// The approved / reopened sets live in memory only: each action
// updates them for optimistic UI AND fires POST /cases/approve /
// POST /cases/{id}/reopen at medcode-api, which stamps the
// logged-in coder and runs the hospital iMed write-back. The
// server is the single source of truth — a reload rebuilds
// everything from the API, so the browser can never show cases
// the database doesn't have (demo-safety; localStorage ghosts
// used to survive DB wipes).
// Activity-log undo un-approves via the "approvals:undo"
// CustomEvent (detail: { caseIds }).
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { approveCases, hasLiveServer, reopenCase } from "../api/casesService";
import { ApprovalsCtx } from "./ApprovalsContext";

export function ApprovalsProvider({ children }: { children: React.ReactNode }) {
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const onUndo = (e: Event) => {
      const ids: string[] = (e as CustomEvent).detail?.caseIds ?? [];
      if (ids.length === 0) return;
      setApprovedIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    };
    window.addEventListener("approvals:undo", onUndo);
    return () => window.removeEventListener("approvals:undo", onUndo);
  }, []);
  // reopened-awaiting-re-approval set — feeds the Dashboard's Reopen tab until
  // the server's refetched payload takes over (pruneReopened yields to the
  // server when it still reports a case as finished).
  const [reopenedIds, setReopenedIds] = useState<Set<string>>(new Set());
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
    // The server has the last word: it refuses a case that still has an empty
    // column, so anything it reports as blocked is rolled back out of the
    // optimistic set and announced (CasesPage turns this into a toast — this
    // provider sits ABOVE ToastProvider and cannot raise one itself).
    void approveCases(ids).then(({ ok, blocked, error }) => {
      if (!ok) {
        // The whole request failed — most likely the hospital write-back
        // 500'd after our side already committed, or a network error. Don't
        // leave the case LOOKING approved when we can't confirm the hospital
        // agrees: roll it back and say so, same event pattern as "blocked".
        setApprovedIds(prev => {
          const n = new Set(prev); ids.forEach(id => n.delete(id)); return n;
        });
        window.dispatchEvent(new CustomEvent("approvals:writeFailed", {
          detail: { caseIds: ids, reason: error },
        }));
        return;
      }
      if (blocked.length === 0) return;
      setApprovedIds(prev => {
        const n = new Set(prev); blocked.forEach(id => n.delete(id)); return n;
      });
      window.dispatchEvent(new CustomEvent("approvals:blocked", {
        detail: { caseIds: blocked },
      }));
    });
  };
  const reopen = (id: string) => {
    const wasApproved = approvedIds.has(id);
    setApprovedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setReopenedIds(prev => new Set(prev).add(id)); // optimistic: into the Reopen tab now
    inFlight.current.add(id);
    reopenCase(id).then(({ ok, error }) => {
      inFlight.current.delete(id);
      if (ok) {
        setCasesVersion(v => v + 1); // server moved it → silent refetch
        return;
      }
      // Couldn't confirm the hospital write-back reverted — undo the optimistic
      // move so the case doesn't sit in "Reopened" while iMed may still show it
      // as approved, and say so (CasesPage turns this into a toast).
      if (wasApproved) {
        setApprovedIds(prev => new Set(prev).add(id));
      }
      setReopenedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      window.dispatchEvent(new CustomEvent("approvals:writeFailed", {
        detail: { caseIds: [id], reason: error },
      }));
    });
  };
  const pruneReopened = useCallback((serverFinishedIds: string[]) => {
    if (!hasLiveServer) return; // static mode: local set is authoritative
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
