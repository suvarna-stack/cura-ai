// ============================================================
// ActivityLogProvider — component half of the activity-log context.
// POC: logs live in localStorage ("audit_activity_logs"); undo is
// allowed within UNDO_WINDOW_MS and best-effort restores the snapshot
// stored in previousState (code edits via caseLocal, approvals via
// localStorage["approvedCases"] + an "approvals:changed" event that
// ApprovalsProvider listens for).
// ============================================================
import { useEffect, useState } from "react";
import { ActivityLogCtx } from "./ActivityLogContext";
import type { NewActivityLog } from "./ActivityLogContext";
import type { ActivityLog } from "../types/activityLog.types";
import { UNDO_WINDOW_MS } from "../types/activityLog.types";
import { loadCodeEdits, saveCodeEdits, type StoredCode } from "../utils/caseLocal";

const STORAGE_KEY = "audit_activity_logs";

// previousState shapes written by the pages (see IncompleteCaseDetail etc.):
//  ADD_CODE     { caseId, code }              → undo removes the code again
//  DELETE_CODE  { caseId, code }              → undo re-adds the code
//  EDIT_CODE    { caseId, before, after }     → undo restores `before`
//  APPROVE_*    { caseIds }                   → undo un-approves those cases
type CodeSnapshot = { caseId: string; code: StoredCode };
type EditSnapshot = { caseId: string; before: StoredCode; after: StoredCode };
type ApproveSnapshot = { caseIds: string[] };

const uid = () => `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** 6 realistic starter entries (Thai patients, real ICD codes from the synced data)
 *  so the drawer / history pages aren't empty on first run. Timestamps span the last
 *  ~2 days: the recent ones fall inside the undo window, the oldest deliberately don't. */
function seedLogs(): ActivityLog[] {
  const ago = (mins: number) => new Date(Date.now() - mins * 60 * 1000).toISOString();
  const base = { userId: "sarah.k", userName: "Sarah K.", isUndone: false as const };
  return [
    { ...base, id: uid() + "_s1", actionType: "APPROVE_CASE", targetId: "86826041006143381201", targetType: "case",
      description: "Approved 2 code(s) for Pornpan Siriporn", previousState: { caseIds: ["86826041006143381201"] }, timestamp: ago(38) },
    { ...base, id: uid() + "_s2", actionType: "ADD_CODE", targetId: "86826041006165662201", targetType: "code",
      description: "Added code 427.31 - Atrial fibrillation to Saowalak Ruangrit", previousState: null, timestamp: ago(95) },
    { ...base, id: uid() + "_s3", actionType: "DELETE_CODE", targetId: "86826041006173971901", targetType: "code",
      description: "Deleted code E78.9 from Kanchana Boonsri",
      previousState: { caseId: "86826041006173971901", code: { code: "E78.9", type: "ICD-10", desc: "Disorder of lipoprotein metabolism, unspecified", confidence: 100 } },
      timestamp: ago(60 * 5) },
    { ...base, id: uid() + "_s4", userId: "naret.p", userName: "Naret P.", actionType: "EDIT_CODE", targetId: "86826041008545561001", targetType: "code",
      description: "Edited code 250.00 → 250.01 for Preecha Wongsawat", previousState: null, timestamp: ago(60 * 9) },
    { ...base, id: uid() + "_s5", actionType: "REOPEN_CASE", targetId: "86826041005200378701", targetType: "case",
      description: "Reopened case for Theerayut Maneerat", previousState: null, timestamp: ago(60 * 26) },
    { ...base, id: uid() + "_s6", userId: "panitda.w", userName: "Panitda W.", actionType: "APPROVE_ALL", targetId: "86826041005244411101", targetType: "case",
      description: "Approved 3 code(s) for Saowalak Ruangrit", previousState: { caseIds: ["86826041005244411101"] }, timestamp: ago(60 * 49) },
  ];
}

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
      try {
        const cur = new Set<string>(JSON.parse(localStorage.getItem("approvedCases") ?? "[]"));
        s.caseIds.forEach(id => cur.delete(id));
        localStorage.setItem("approvedCases", JSON.stringify([...cur]));
        window.dispatchEvent(new Event("approvals:changed"));
      } catch { /* demo keeps running */ }
      break;
    }
  }
}

export function ActivityLogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<ActivityLog[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as ActivityLog[];
    } catch { /* fall through to seed */ }
    return seedLogs();
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(logs)); } catch { /* quota/private mode */ }
  }, [logs]);

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
