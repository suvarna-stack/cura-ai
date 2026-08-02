// ============================================================
// ActivityLogProvider — component half of the activity-log context.
// Logs live in memory for the session only (nothing persisted in the
// browser — a reload starts clean, so the log can never show actions
// from before a DB wipe). Undo is allowed within UNDO_WINDOW_MS and
// best-effort restores the snapshot stored in previousState (code
// edits via caseLocal, approvals via the "approvals:undo" event that
// ApprovalsProvider listens for).
// ============================================================
import { useState } from "react";
import { ActivityLogCtx } from "./ActivityLogContext";
import type { NewActivityLog } from "./ActivityLogContext";
import type { ActivityLog } from "../types/activityLog.types";
import { UNDO_WINDOW_MS } from "../types/activityLog.types";
import { loadCodeEdits, saveCodeEdits, type StoredCode } from "../utils/caseLocal";

// previousState shapes written by the pages (see IncompleteCaseDetail etc.):
//  ADD_CODE     { caseId, code }              → undo removes the code again
//  DELETE_CODE  { caseId, code }              → undo re-adds the code
//  EDIT_CODE    { caseId, before, after }     → undo restores `before`
//  APPROVE_*    { caseIds }                   → undo un-approves those cases
type CodeSnapshot = { caseId: string; code: StoredCode };
type EditSnapshot = { caseId: string; before: StoredCode; after: StoredCode };
type ApproveSnapshot = { caseIds: string[] };

const uid = () => `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Best-effort state restoration from a log's previousState snapshot. */
function restore(log: ActivityLog) {
  switch (log.actionType) {
    case "ADD_CODE": {
      const s = log.previousState as CodeSnapshot | null;
      if (!s?.caseId || !s.code) return;
      const cur = loadCodeEdits(s.caseId) ?? [];
      saveCodeEdits(s.caseId, cur.filter(k => !(k.code === s.code.code && k.desc === s.code.desc)));
      break;
    }
    case "DELETE_CODE": {
      const s = log.previousState as CodeSnapshot | null;
      if (!s?.caseId || !s.code) return;
      const cur = loadCodeEdits(s.caseId) ?? [];
      saveCodeEdits(s.caseId, [...cur, s.code]);
      break;
    }
    case "EDIT_CODE": {
      const s = log.previousState as EditSnapshot | null;
      if (!s?.caseId || !s.before) return;
      const cur = loadCodeEdits(s.caseId) ?? [];
      saveCodeEdits(s.caseId, cur.map(k => (k.code === s.after?.code && k.desc === s.after?.desc ? s.before : k)));
      break;
    }
    case "APPROVE_CASE":
    case "APPROVE_ALL": {
      const s = log.previousState as ApproveSnapshot | null;
      if (!s?.caseIds?.length) return;
      window.dispatchEvent(new CustomEvent("approvals:undo", { detail: { caseIds: s.caseIds } }));
      break;
    }
  }
}

export function ActivityLogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const addLog = (log: NewActivityLog): string => {
    const id = uid();
    setLogs(prev => [...prev, { ...log, id, timestamp: new Date().toISOString(), isUndone: false }]);
    return id;
  };

  const undoLog = (id: string): boolean => {
    const log = logs.find(l => l.id === id);
    if (!log || log.isUndone) return false;
    if (Date.now() - new Date(log.timestamp).getTime() > UNDO_WINDOW_MS) return false;
    restore(log);
    const undoEntry: ActivityLog = {
      id: uid(), userId: log.userId, userName: log.userName,
      actionType: "UNDO", targetId: log.targetId, targetType: log.targetType,
      description: `Undid: ${log.description}`, previousState: null,
      timestamp: new Date().toISOString(), isUndone: false,
    };
    setLogs(prev => [...prev.map(l => (l.id === id ? { ...l, isUndone: true } : l)), undoEntry]);
    return true;
  };

  const clearLogs = () => setLogs([]);

  return (
    <ActivityLogCtx.Provider value={{ logs, addLog, undoLog, clearLogs }}>
      {children}
    </ActivityLogCtx.Provider>
  );
}
