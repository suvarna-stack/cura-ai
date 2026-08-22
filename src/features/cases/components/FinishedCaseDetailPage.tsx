import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useState } from "react";
import {
  FileText, Flag, ArrowLeft, BadgeCheck, Download, Printer,
  RotateCcw, Clock, Users,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LanguageContext";
import { useApprovals } from "../context/ApprovalsContext";
import { useActivityLog } from "../context/ActivityLogContext";
import { useCoderIdentity } from "../hooks/useCoderIdentity";
import { useToast } from "../context/ToastContext";
import { useCaseDetail } from "../hooks/useCaseDetail";
import { ConfirmDialog } from "./global/ConfirmDialog";
import { CodesColumn } from "./codes/CodesColumn";
import type { CodeSystem } from "./codes/CodesColumn";
import { ReportHeader } from "./global/ReportHeader";
import { ReportOrders } from "./global/ReportOrders";
import { VitalsStrip } from "./global/VitalsStrip";
import { LabResults } from "./global/LabResults";
import { HospitalPanels, ReportViewToggle, useReportView } from "./global/HospitalPanels";
import { ReportSkeleton } from "./global/DetailSkeletons";
import { loadCodeEdits, type StoredCode } from "../utils/caseLocal";
import { codeTypeFromRole } from "../utils/aiSuggestions";
import { buildCaseReportDocument, caseReportFilename } from "../utils/caseReportDocument";
import { printHtmlDocument, openHtmlPreview } from "../utils/printDocument";
import type { FinishedCase } from "../types/case.types";
import { CaseAgentDock } from "../../agent/components/CaseAgentDock";

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
  useDocumentTitle(caseData ? `Case ${caseData.vn ?? caseData.id}` : null);
  const { addLog } = useActivityLog();
  const me = useCoderIdentity();
  const { showToast } = useToast();
  const [showReopen, setShowReopen] = useState(false);
  // an approved case is FINAL: no add/edit/delete/reorder here — the columns
  // render read-only and the only path to changing codes is the Reopen button
  // (matching the backend, where the hospital diff runs at approve time only)

  // real report + final codes from the synced iMed data; the status tells
  // "still loading" apart from "fetch failed" so neither shows the wrong text
  const { detail, status } = useCaseDetail(caseData?.id);
  // hospital-panel vs chronological record view (persisted, shared across pages)
  const [view, setView] = useReportView();
  if (!caseData) return null;
  const c = caseData;
  const reportText = detail && detail.sections.length > 0
    ? detail.sections
        .map(s => `[${s.fieldname}]  (${s.documenttype}${s.recorddatetime ? " · " + s.recorddatetime : ""})\n${s.value ?? "—"}`)
        .join("\n\n")
    : null;
  // the coder's saved edits are the finalized codes — server copy first
  // (live backend = shared truth), then the session cache; they win over the
  // fetched iMed data (same rule as CaseDetail/IncompleteCaseDetail);
  // unresolved "???" rows are never part of the final code set
  const saved = detail?.codeEdits ?? loadCodeEdits(c.id);
  const fullCodes: StoredCode[] = saved
    ?? (detail
      ? detail.codes.map(k => ({
          // role-bearing label (external cause / other included), same as the
          // open-case pages
          code: k.code, type: codeTypeFromRole(k.code_system, k.code_role),
          desc: `${k.description ?? k.code}${k.code_role ? ` · ${k.code_role.replace(/_/g, " ")}` : ""}`,
          confidence: 100, // imported from iMed = fact
          // which group the card renders in; a hospital row shows no % at all
          origin: k.source === "imported_from_imed" ? "hospital" as const : "manual" as const,
          // procedure time window + type (ICD-9 rows; the hospital's own record)
          operation_start: k.operation_start ?? undefined,
          operation_end: k.operation_end ?? undefined,
          operation_type: k.operation_type ?? undefined,
        }))
      : []);
  const codes = fullCodes.filter(k => !k.missing);

  const panel: React.CSSProperties = {
    background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20,
    border: gl.border, boxShadow: gl.shadow,
  };

  const dc = detail?.case;
  // item 16: a case can have many coders — the responsible one is the latest
  const coders = c.coders?.length ? c.coders : [c.coder];

  // Print / Export PDF — one document, two destinations. Both render the
  // Coding Summary (utils/caseReportDocument) through the browser's own print
  // engine; Export opens it as a visible page first so the coder sees what
  // they are saving, and falls back to the silent frame if popups are blocked.
  // fullCodes, not codes: the document splits the approved set from the
  // suggestions the coder left out, and needs both.
  const reportDocument = (mode: "print" | "preview") =>
    buildCaseReportDocument(
      { caseData: c, detail, codes: fullCodes, generatedBy: me.userName },
      { mode },
    );

  const handlePrint = () => {
    // half a record is worse than none on a document that gets filed
    if (status === "loading") { showToast(t("print.notReady")); return; }
    printHtmlDocument(reportDocument("print"), caseReportFilename(c));
    showToast(t("print.opening"));
  };

  const handleExportPdf = () => {
    if (status === "loading") { showToast(t("print.notReady")); return; }
    if (!openHtmlPreview(reportDocument("preview"))) {
      printHtmlDocument(reportDocument("print"), caseReportFilename(c));
    }
    showToast(t("print.saveHint"));
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {showReopen && (
        <ConfirmDialog
          icon={RotateCcw} danger
          title={t("confirm.reopen.title")}
          body={t("confirm.reopen.body", { patientName: c.patient })}
          confirmLabel={t("confirm.reopen.confirm")}
          onConfirm={() => {
            setShowReopen(false);
            reopen(c.id);
            const logId = addLog({
              userId: me.userId, userName: me.userName, actionType: "REOPEN_CASE",
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
          {/* the case actions live at the top of the page, with its status.
              Both print the same Coding Summary document — Print sends it
              straight to the printer, Export PDF opens it so the coder can
              save it from the dialog's "Save as PDF" destination. */}
          <button onClick={handlePrint} title={t("print.title")} aria-label={t("print.title")}
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:opacity-80 transition-all"
            style={{ border: gl.border, color: gl.muted, background: "transparent" }}>
            <Printer size={13} />
          </button>
          <button onClick={handleExportPdf} title={t("print.exportTitle")} aria-label={t("print.exportTitle")}
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
              <h2 className="text-[17px] font-bold flex-1" style={{ color: gl.text }}>Discharge Report</h2>
              <ReportViewToggle view={view} onChange={setView} />
            </div>
            <ReportHeader detail={detail} caseId={c.id} dept={c.dept} />
            {/* item 16: everyone who worked this case, latest (= responsible) last */}
            <div className="flex items-center gap-2 mt-2">
              <Users size={11} style={{ color: gl.accent }} className="shrink-0" />
              <span className="text-[12px] font-normal" style={{ color: gl.muted }}>{t("coder.all")}:</span>
              <span className="text-[12px] font-semibold truncate" style={{ color: gl.text }}>
                {coders.join(" → ")}
              </span>
              <span className="text-[12px] font-normal" style={{ color: gl.muted }}>· {c.codedDate}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 scroll-thin" style={{ color: gl.text }}>
            {/* hospital view = the record regrouped into the hospital's own
                panels; the chronological path below is unchanged */}
            {view === "hospital" && status !== "loading" && detail ? (
              <HospitalPanels detail={detail} />
            ) : (<>
            {/* hospital vital signs above the note text, like the original coder UI */}
            {status !== "loading" && <VitalsStrip detail={detail} />}
            {reportText ? (
              <HighlightedReport text={reportText} accent={gl.accent} />
            ) : status === "loading" ? (
              <ReportSkeleton />
            ) : (
              <p className="text-xs leading-7" style={{ color: gl.muted }}>
                No report sections synced for this case.
              </p>
            )}
            {status !== "loading" && <LabResults detail={detail} />}
            {status !== "loading" && <ReportOrders detail={detail} />}
            </>)}
          </div>
        </div>

        {/* three containers side by side: Report | ICD-10 | ICD-9 — read-only:
            no add/delete/reorder handlers, so the columns render no controls */}
        {(["icd10", "icd9"] as CodeSystem[]).map((sys) => (
          <CodesColumn key={sys} system={sys}
            codes={codes}
            loading={codes.length === 0 && status === "loading"}
          />
        ))}
      </div>

      {/* The agent, floating on top of the case: a code question gets answered
          here instead of costing a trip to /agent and the record on screen. */}
      <CaseAgentDock ctx={{ caseId: c.id, vn: c.vn ?? c.id,
                            hn: dc?.patient_ref ?? c.hn ?? null,
                            dept: c.dept ?? dc?.department ?? undefined, detail, codes: codes }} />
    </main>
  );
}
