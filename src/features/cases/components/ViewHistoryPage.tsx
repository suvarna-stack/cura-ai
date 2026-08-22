import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
// ============================================================
// ViewHistory (Prompt 5) — per-case timeline of everything coders
// did to a case, from the shared activity log. Entries inside the
// undo window can be undone from here.
// ============================================================
import { useEffect, useState } from "react";
import { ChevronLeft, Clock, Undo2, Server } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LanguageContext";
import { useActivityLog } from "../context/ActivityLogContext";
import { useCaseDetail } from "../hooks/useCaseDetail";
import { ConfirmDialog } from "./global/ConfirmDialog";
import { formatDateTime } from "../utils/formatDate";
import { actionIcon } from "../utils/actionIcon";
import { UNDOABLE_ACTIONS, UNDO_WINDOW_MS } from "../types/activityLog.types";
import type { ActionType } from "../types/activityLog.types";
import type { ApiCaseHistoryEntry } from "../types/api.types";

// meeting item 17: the case's history must show what OTHER coders did, not
// just this browser's log — so the server's coding_history rows are merged in.
// They are read-only: another coder's action is not this coder's to undo.
const SERVER_ACTION: Record<string, ActionType> = {
  approved_single: "APPROVE_CASE",
  approved_group:  "APPROVE_ALL",
  approved_all:    "APPROVE_ALL",
  reopened:        "REOPEN_CASE",
  code_assigned:   "ADD_CODE",
};
const serverText = (h: ApiCaseHistoryEntry) => {
  const n = typeof h.detail?.codes === "number" ? (h.detail.codes as number) : null;
  switch (h.action) {
    case "reopened":      return `Reopened the case`;
    case "code_assigned": return `Finalized ${n ?? "the"} code(s)`;
    default:              return `Approved the case`;
  }
};
/** "YYYY-MM-DD HH:MM:SS" (SQLite) -> ISO so it sorts next to the local logs */
const toIso = (at: string) => (at.includes("T") ? at : at.replace(" ", "T"));

interface ViewHistoryProps {
  caseId: string;
  patientName: string;
  onBack: () => void;
}

export function ViewHistoryPage({ caseId, patientName, onBack }: ViewHistoryProps) {
  const { gl } = useTheme();
  const { t } = useLang();
  const { logs, undoLog } = useActivityLog();
  useDocumentTitle(t("history.title"));
  const [undoneToast, setUndoneToast] = useState(false);
  // an undone approval withdraws codes from iMed and puts the case back in its
  // queue, so the timeline asks before it reverses anything
  const [pendingUndo, setPendingUndo] = useState<{ id: string; description: string } | null>(null);

  // local (this browser, undoable) + server (every coder, read-only), newest first
  const { detail } = useCaseDetail(caseId);
  const entries = [
    ...logs.filter((l) => l.targetId === caseId).map((log) => ({ kind: "local" as const, at: log.timestamp, log })),
    ...(detail?.history ?? []).map((h) => ({ kind: "server" as const, at: toIso(h.at), h })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  // "now" lives in state (refreshed every 30s) so render stays pure and the
  // undo window expires visibly while the page is open
  const [now, setNow] = useState(Number.MAX_SAFE_INTEGER);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0); // deferred so the effect itself stays render-safe
    const timer = setInterval(tick, 30_000);
    return () => { clearTimeout(t0); clearInterval(timer); };
  }, []);

  const handleUndo = (id: string) => {
    setPendingUndo(null);
    if (undoLog(id)) {
      setUndoneToast(true);
      setTimeout(() => setUndoneToast(false), 3000);
    }
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {pendingUndo && (
        <ConfirmDialog
          icon={Undo2} danger
          title={t("confirm.undo.title")}
          body={t("confirm.undo.body", { action: pendingUndo.description })}
          confirmLabel={t("confirm.undo.confirm")}
          onConfirm={() => handleUndo(pendingUndo.id)}
          onClose={() => setPendingUndo(null)}
        />
      )}

      {/* header — matches the detail pages' header pattern */}
      <header className="shrink-0 px-6 py-3.5 flex items-center gap-3"
        style={{ background: gl.headerBg, backdropFilter: gl.blur20, borderBottom: gl.borderSm }}>
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg hover:opacity-80 transition-all"
          style={{ background: gl.row, border: gl.borderSm, color: gl.muted }}>
          <ChevronLeft size={12} /> {t("history.back")}
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-[19px] font-bold" style={{ fontFamily: "'Playfair Display', serif", color: gl.text }}>
            {t("history.title")} — {patientName}
          </h1>
          <span className="text-[12px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.22)` }}>
            {caseId}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
        <div className="max-w-2xl mx-auto rounded-2xl p-5"
          style={{ background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20, border: gl.border, boxShadow: gl.shadow }}>
          {entries.length === 0 ? (
            /* empty state */
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Clock size={56} style={{ color: gl.muted, opacity: 0.3 }} />
              <p className="text-[13px] font-medium" style={{ color: gl.muted }}>{t("history.empty")}</p>
            </div>
          ) : (
            <div>
              {entries.map((row, i) => {
                const server = row.kind === "server";
                const log = row.kind === "local" ? row.log : null;
                const actionType = server ? (SERVER_ACTION[row.h.action] ?? "EDIT_CODE") : log!.actionType;
                const { Icon, color } = actionIcon(actionType, gl);
                const description = server ? serverText(row.h) : log!.description;
                const who = server ? row.h.coder : log!.userName;
                const isUndone = !server && log!.isUndone;
                const canUndo =
                  !server && !log!.isUndone &&
                  UNDOABLE_ACTIONS.includes(log!.actionType) &&
                  now - new Date(log!.timestamp).getTime() <= UNDO_WINDOW_MS;
                return (
                  <div key={server ? `srv-${i}` : log!.id} className="flex gap-3">
                    {/* icon node + vertical connector */}
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `rgba(${gl.accentRgb},0.08)`, border: gl.border }}>
                        <Icon size={14} style={{ color }} />
                      </div>
                      {i < entries.length - 1 && (
                        <div className="w-px flex-1 my-1" style={{ background: `rgba(${gl.accentRgb},0.2)` }} />
                      )}
                    </div>
                    {/* entry body */}
                    <div className="flex-1 min-w-0 pb-5">
                      <p className="text-[13px] font-medium leading-snug"
                        style={{ color: gl.text, opacity: isUndone ? 0.55 : 1, textDecoration: isUndone ? "line-through" : undefined }}>
                        {description}
                      </p>
                      <p className="text-[12px] mt-0.5 flex items-center gap-1.5" style={{ color: gl.muted }}>
                        <span className="font-semibold">{who}</span> · {formatDateTime(row.at)}
                        {server && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-1.5 py-0.5 rounded-md"
                            style={{ background: `rgba(${gl.accentRgb},0.10)`, color: gl.accent }}
                            title={t("history.serverHint")}>
                            <Server size={9} /> {t("history.server")}
                          </span>
                        )}
                      </p>
                      {isUndone ? (
                        <span className="inline-block text-[12px] font-semibold mt-1.5 px-2 py-0.5 rounded-md"
                          style={{ background: gl.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: gl.muted }}>
                          ↩️ {t("activity.undone")}
                        </span>
                      ) : canUndo && (
                        <button onClick={() => setPendingUndo({ id: log!.id, description })}
                          className="flex items-center gap-1 text-[12px] font-bold mt-1.5 px-2.5 py-1 rounded-lg hover:opacity-80 transition-all"
                          style={{ background: "transparent", color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.30)` }}>
                          <Undo2 size={10} /> {t("activity.undo")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3-second success toast after an undo — live region stays mounted so
          screen readers announce the message when it appears */}
      <div role="status" aria-live="polite"
        className={undoneToast ? "fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl text-[12px] font-semibold" : "sr-only"}
        style={undoneToast ? {
          background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20,
          border: `1px solid rgba(${gl.accentRgb},0.25)`, boxShadow: gl.shadow, color: gl.text,
        } : undefined}>
        {undoneToast ? t("activity.actionUndone") : null}
      </div>
    </main>
  );
}
