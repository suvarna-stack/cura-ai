import { useState } from "react";
import {
  FileText, Flag, ArrowLeft, BadgeCheck, Download, Printer,
  RotateCcw, AlertCircle, Clock, Users, Trash2,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LanguageContext";
import { useApprovals } from "../context/ApprovalsContext";
import { useActivityLog } from "../context/ActivityLogContext";
import { useToast } from "../context/ToastContext";
import { useCaseDetail } from "../hooks/useCaseDetail";
import { AddCodeModal } from "./codes/AddCodeModal";
import { CodesColumn } from "./codes/CodesColumn";
import type { CodeSystem } from "./codes/CodesColumn";
import { ConfirmDialog } from "./codes/ConfirmDialog";
import { ReportHeader } from "./global/ReportHeader";
import { ReportOrders } from "./global/ReportOrders";
import { ReportSkeleton } from "./global/DetailSkeletons";
import { loadCodeEdits, saveCodeEdits, type StoredCode } from "../utils/caseLocal";
import type { FinishedCase } from "../types/case.types";

/** Renders the real iMed report text; the [fieldname] section headers built from
 *  MedHack_MedicalRecord sections are emphasised in the accent colour. */
function HighlightedReport({ text, accent }: { text: string; accent: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <p className="text-[13px] leading-7 whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.startsWith("[") && part.endsWith("]")
          ? <span key={i} style={{ color: accent, fontWeight: 600 }}>{part}</span>
          : <span key={i}>{part}</span>
      )}
    </p>
  );
}

// Confirmation modal for re-opening
function ReopenModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const { gl } = useTheme();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: gl.isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.40)" }} onClick={onClose}>
      <div className="w-[400px] rounded-2xl overflow-hidden"
        style={{ background: gl.isDark ? "#1e1218" : "#fff", border: `1.5px solid rgba(${gl.accentRgb},0.35)`, boxShadow: `0 24px 60px rgba(0,0,0,0.35)` }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid rgba(${gl.accentRgb},0.15)`, background: `rgba(${gl.accentRgb},0.06)` }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: `rgba(${gl.accentRgb},0.15)`, border: `1px solid rgba(${gl.accentRgb},0.25)` }}>
              <AlertCircle size={15} style={{ color: gl.accent }} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold" style={{ color: gl.text }}>Re-open for Editing?</h3>
              <p className="text-[11px]" style={{ color: gl.muted }}>This will move the case back to Incomplete</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-[13px] leading-relaxed" style={{ color: gl.muted }}>
            Re-opening this case will remove its <strong style={{ color: gl.text }}>Finished</strong> status and allow codes and the report to be edited again. This action is logged.
          </p>
        </div>
        <div className="px-5 py-4 flex gap-2.5" style={{ borderTop: `1px solid rgba(${gl.accentRgb},0.12)` }}>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold hover:opacity-80 transition-all"
            style={{ border: `1.5px solid rgba(${gl.accentRgb},0.30)`, color: gl.text, background: "transparent" }}>Cancel</button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all"
            style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff", boxShadow: `0 4px 16px rgba(${gl.accentRgb},0.35)` }}>
            <RotateCcw size={12} /> Yes, Re-open
          </button>
        </div>
      </div>
    </div>
  );
}

export function FinishedCaseDetailPage({
  caseData, onBack, onViewHistory,
}: {
  caseData: FinishedCase | null;
  onBack: () => void;
  /** navigates to the ViewHistory page for this case (Prompt 4 Feature 5) */
  onViewHistory: (caseId: string, patientName: string) => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const { reopen } = useApprovals();
  const { addLog } = useActivityLog();
  const { showToast } = useToast();
  const [showReopen, setShowReopen] = useState(false);
  // add / delete code dialogs (Prompt 4) — mutations persist to the same
  // codeEdits store the other detail pages use; the tick forces a re-derive
  const [adding, setAdding] = useState<CodeSystem | null>(null);
  const [deleting, setDeleting] = useState<StoredCode | null>(null);
  const [, setCodesTick] = useState(0);

  // real report + final codes from the synced iMed data; the status tells
  // "still loading" apart from "fetch failed" so neither shows the wrong text
  const { detail, status } = useCaseDetail(caseData?.id);
  if (!caseData) return null;
  const c = caseData;
  const reportText = detail && detail.sections.length > 0
    ? detail.sections
        .map(s => `[${s.fieldname}]  (${s.documenttype}${s.recorddatetime ? " · " + s.recorddatetime : ""})\n${s.value ?? "—"}`)
        .join("\n\n")
    : null;
  // the coder's saved edits are the finalized codes — server copy first
  // (live backend = shared truth), then localStorage; they win over the
  // fetched iMed data (same rule as CaseDetail/IncompleteCaseDetail);
  // unresolved "???" rows are never part of the final code set
  const saved = detail?.codeEdits ?? loadCodeEdits(c.id);
  const fullCodes: StoredCode[] = saved
    ?? (detail
      ? detail.codes.map(k => ({
          code: k.code, type: k.code_system,
          desc: `${k.description ?? k.code}${k.code_role ? ` · ${k.code_role.replace(/_/g, " ")}` : ""}`,
          confidence: 100, // imported from iMed = fact
        }))
      : []);
  const codes = fullCodes.filter(k => !k.missing);

  // mutations write through codeEdits (materialising the iMed list on first
  // edit) and bump the tick so the derived list re-reads localStorage
  const persistCodes = (next: StoredCode[]) => { saveCodeEdits(c.id, next); setCodesTick(v => v + 1); };

  const handleAddCode = (entry: { code: string; type: string; desc: string }) => {
    const added: StoredCode = { ...entry, confidence: 100, manual: true };
    persistCodes([...fullCodes, added]);
    setAdding(null);
    const logId = addLog({
      userId: "sarah.k", userName: "Sarah K.", actionType: "ADD_CODE",
      targetId: c.id, targetType: "code",
      description: `Added code ${entry.code} - ${entry.desc} to ${c.patient}`,
      previousState: { caseId: c.id, code: added },
    });
    showToast(`Added code ${entry.code} - ${entry.desc} to ${c.patient}`, logId);
  };

  const handleDeleteCode = () => {
    if (!deleting) return;
    const removed = deleting;
    persistCodes(fullCodes.filter(k => !(k.code === removed.code && k.desc === removed.desc)));
    setDeleting(null);
    const logId = addLog({
      userId: "sarah.k", userName: "Sarah K.", actionType: "DELETE_CODE",
      targetId: c.id, targetType: "code",
      description: `Deleted code ${removed.code} from ${c.patient}`,
      previousState: { caseId: c.id, code: removed },
    });
    showToast(`Deleted code ${removed.code} from ${c.patient}`, logId);
  };

  const panel: React.CSSProperties = {
    background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20,
    border: gl.border, boxShadow: gl.shadow,
  };

  const dc = detail?.case;
  // item 16: a case can have many coders — the responsible one is the latest
  const coders = c.coders?.length ? c.coders : [c.coder];

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {showReopen && (
        <ReopenModal
          onConfirm={() => {
            setShowReopen(false);
            reopen(c.id);
            const logId = addLog({
              userId: "sarah.k", userName: "Sarah K.", actionType: "REOPEN_CASE",
              targetId: c.id, targetType: "case",
              description: `Reopened case for ${c.patient}`,
              previousState: null,
            });
            showToast(`Reopened case for ${c.patient}`, logId);
            onBack();
          }}
          onClose={() => setShowReopen(false)}
        />
      )}
      {adding && <AddCodeModal only={adding} onAdd={handleAddCode} onClose={() => setAdding(null)} />}
      {deleting && (
        <ConfirmDialog
          icon={Trash2} danger
          title={t("confirm.deleteCode")}
          body={t("confirm.deleteCodeBody", { code: deleting.code })}
          confirmLabel={t("confirm.delete")}
          onConfirm={handleDeleteCode}
          onClose={() => setDeleting(null)}
        />
      )}

      <header className="shrink-0 px-6 py-3.5 flex items-center justify-between"
        style={{ background: gl.headerBg, backdropFilter: gl.blur20, borderBottom: gl.borderSm }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg hover:opacity-80 transition-all"
            style={{ background: gl.row, border: gl.borderSm, color: gl.muted }}>
            <ArrowLeft size={12} /> Back
          </button>
          {/* item 2: identified by VN / HN */}
          <div>
            <h1 className="text-[19px] font-bold" style={{ fontFamily: "'Playfair Display', serif", color: gl.text }}>
              VN {c.vn ?? c.id}
            </h1>
            <p className="text-[12px] font-normal" style={{ color: gl.muted }}>
              HN {dc?.patient_ref ?? c.hn ?? "—"}{dc?.department ? ` · ${dc.department}` : ""}
            </p>
          </div>
          {/* the case's status sits with its identity, not with the actions */}
          <span className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full"
            style={{ background: `rgba(${gl.accentRgb},0.15)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.30)` }}>
            <BadgeCheck size={13} /> Approved · {c.codedDate}
          </span>
          <span className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full"
            style={{ background: `rgba(${gl.accentRgb},0.10)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.20)` }}>
            <Flag size={12} /> {c.drg}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onViewHistory(c.id, c.patient)}
            className="flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg hover:opacity-80 transition-all"
            style={{ background: "transparent", border: gl.border, color: gl.text }}>
            <Clock size={12} /> {t("btn.viewHistory")}
          </button>
          {/* the case actions live at the top of the page, with its status —
              [POC] Print / Export PDF are still placeholders */}
          <button title="Print"
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:opacity-80 transition-all"
            style={{ border: gl.border, color: gl.muted, background: "transparent" }}>
            <Printer size={13} />
          </button>
          <button title="Export PDF"
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:opacity-80 transition-all"
            style={{ border: gl.border, color: gl.muted, background: "transparent" }}>
            <Download size={13} />
          </button>
          <button onClick={() => setShowReopen(true)}
            className="flex items-center gap-1.5 text-[13px] font-bold px-4 py-2 rounded-lg hover:opacity-80 transition-all"
            style={{ border: `1.5px solid rgba(${gl.accentRgb},0.30)`, color: gl.accent, background: `rgba(${gl.accentRgb},0.07)` }}>
            <RotateCcw size={12} /> {t("btn.reopen")}
          </button>
        </div>
      </header>

      <div className="flex-1 flex gap-4 p-5 overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden min-w-0" style={panel}>
          <div className="px-5 py-4 shrink-0" style={{ borderBottom: gl.borderSm }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={15} style={{ color: gl.accent }} />
              <h2 className="text-[17px] font-bold" style={{ color: gl.text }}>Discharge Report</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"
                style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent }}>Read-only</span>
            </div>
            <ReportHeader detail={detail} caseId={c.id} dept={c.dept} />
            {/* item 16: everyone who worked this case, latest (= responsible) last */}
            <div className="flex items-center gap-2 mt-2">
              <Users size={11} style={{ color: gl.accent }} className="shrink-0" />
              <span className="text-[12px] font-normal" style={{ color: gl.muted }}>{t("coder.all")}:</span>
              <span className="text-[12px] font-semibold truncate" style={{ color: gl.text }}>
                {coders.join(" → ")}
              </span>
              <span className="text-[10px] font-normal" style={{ color: gl.muted }}>· {c.codedDate}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 scroll-thin" style={{ color: gl.text }}>
            {reportText ? (
              <HighlightedReport text={reportText} accent={gl.accent} />
            ) : status === "loading" ? (
              <ReportSkeleton />
            ) : (
              <p className="text-xs leading-7" style={{ color: gl.muted }}>
                No report sections synced for this case.
              </p>
            )}
            {status !== "loading" && <ReportOrders detail={detail} />}
          </div>
        </div>

        {/* three containers side by side: Report | ICD-10 | ICD-9 */}
        {(["icd10", "icd9"] as CodeSystem[]).map((sys) => (
          <CodesColumn key={sys} system={sys}
            codes={codes}
            loading={codes.length === 0 && status === "loading"}
            /* the columns only see resolved codes, so unresolved "???" rows are
               appended back rather than dropped from storage */
            onReorder={(next) => persistCodes([...next, ...fullCodes.filter(k => k.missing)])}
            onDelete={(i) => setDeleting(codes[i])}
            onAdd={setAdding}
          />
        ))}
      </div>
    </main>
  );
}
