import { useState, useEffect } from "react";
import {
  FileText, CheckCircle2, BadgeCheck, AlertCircle,
  Edit3, ArrowLeft, X, Check, RotateCcw, Trash2, Clock,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LanguageContext";
import { useApprovals } from "../context/ApprovalsContext";
import { useActivityLog } from "../context/ActivityLogContext";
import { useToast } from "../context/ToastContext";
import { useCaseDetail } from "../hooks/useCaseDetail";
import { suggestCodes } from "../api/casesService";
import { fillEmptySystems, isIcd9Type, codeTypeFromRole } from "../utils/aiSuggestions";
import { AddCodeModal, CODE_TYPE_PRIMARY, CODE_TYPE_COMORBIDITY,
         CODE_TYPE_ICD10_PRIMARY, CODE_TYPE_ICD10_COMORBIDITY,
         CODE_TYPE_ICD10_OTHER, CODE_TYPE_ICD10_EXTERNAL } from "./codes/AddCodeModal";
import { CodeSearchField, systemFromCodeType } from "./codes/CodeSearchField";
import { CodesColumn } from "./codes/CodesColumn";
import type { CodeSystem } from "./codes/CodesColumn";
import { ConfirmDialog } from "./codes/ConfirmDialog";
import { ReportHeader } from "./global/ReportHeader";
import { ReportOrders } from "./global/ReportOrders";
import { VitalsStrip } from "./global/VitalsStrip";
import { LabResults } from "./global/LabResults";
import { HospitalPanels, ReportViewToggle, useReportView } from "./global/HospitalPanels";
import { ReportSkeleton } from "./global/DetailSkeletons";
import { loadCodeEdits, saveCodeEdits, loadReportDraft, type StoredCode } from "../utils/caseLocal";
import { nowOperationTime, toInputValue, fromInputValue, OPERATION_TYPES } from "../utils/operationTime";
import type { IncompleteCase, CodeEntry } from "../types/case.types";

// the allowed code types, per system (item 11; ICD-10 carries the hospital
// dropdown's four diagnosis kinds)
const CODE_TYPES = [CODE_TYPE_ICD10_PRIMARY, CODE_TYPE_ICD10_COMORBIDITY,
                    CODE_TYPE_ICD10_OTHER, CODE_TYPE_ICD10_EXTERNAL,
                    CODE_TYPE_PRIMARY, CODE_TYPE_COMORBIDITY];

const initialReport = `DISCHARGE SUMMARY — DRAFT

Patient presented with progressive exertional chest pain and dyspnoea on exertion over the past 3 weeks. History of [PRIMARY DIAGNOSIS NOT DOCUMENTED]. Symptoms worsened over 48 hours prior to admission.

On examination: blood pressure 158/94 mmHg, heart rate 88 bpm, oxygen saturation 96% on room air. Cardiac auscultation revealed an irregularly irregular rhythm.

ECG findings: [ECG INTERPRETATION PENDING]. Troponin levels: [TROPONIN RESULT NOT DOCUMENTED].

The patient underwent [PROCEDURE NOT DOCUMENTED — PLEASE SPECIFY INTERVENTION]. Post-procedure observations were stable.

Medications on discharge: aspirin 100 mg daily, bisoprolol 5 mg daily. Full medication reconciliation [PENDING PHARMACIST REVIEW].

Patient was counselled on [LIFESTYLE ADVICE NOT DOCUMENTED]. Follow-up appointment scheduled.

Note: This report requires completion before coding can be finalised. Missing sections have been flagged for physician review.`;

const medicalHighlights = [
  "chest pain", "dyspnoea", "blood pressure", "heart rate", "oxygen saturation",
  "Cardiac auscultation", "irregularly irregular rhythm", "atrial fibrillation",
  "ECG", "Troponin", "aspirin", "bisoprolol", "hypertension",
  "medication reconciliation", "discharge",
];

const initialCodes: (CodeEntry & { missing?: boolean; missingMsg?: string })[] = [
  { code: "I48.0",   type: "ICD-10",     desc: "Paroxysmal atrial fibrillation — inferred from rhythm description", confidence: 72 },
  { code: "???",     type: "ICD-10",     desc: "Primary diagnosis not documented — fill in report to assign",        confidence: 0,  missing: true, missingMsg: "Missing: Primary diagnosis" },
  { code: "I10",     type: "ICD-10",     desc: "Essential hypertension — supported by blood pressure reading",       confidence: 85 },
  { code: "???",     type: "ICD-10-PCS", desc: "Procedure code pending — add intervention details to report",       confidence: 0,  missing: true, missingMsg: "Missing: Procedure documentation" },
  { code: "Z87.39",  type: "ICD-10",     desc: "Personal history of other endocrine, nutritional disorders",         confidence: 58 },
  { code: "DRG-???", type: "DRG",        desc: "DRG pending primary diagnosis and procedure",                        confidence: 0,  missing: true, missingMsg: "Pending primary dx + procedure" },
];

function HighlightedReport({ text, accentRgb, accent }: { text: string; accentRgb: string; accent: string }) {
  const escapedTerms = medicalHighlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(\\[[^\\]]+\\]|${escapedTerms.join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <p className="text-[13px] leading-7 whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith("[") && part.endsWith("]"))
          return <span key={i} style={{ color: accent, fontWeight: 600 }}>{part}</span>;
        if (medicalHighlights.some(h => h.toLowerCase() === part.toLowerCase()))
          return <mark key={i} style={{ background: `rgba(${accentRgb},0.18)`, color: "inherit", borderRadius: "3px", padding: "0 3px" }}>{part}</mark>;
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function EditCodeModal({ entry, onSave, onClose, localHits }: {
  entry: CodeEntry & { missing?: boolean; missingMsg?: string };
  onSave: (u: CodeEntry) => void;
  onClose: () => void;
  localHits?: { code: string; system: string; description: string }[];
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  // an ICD-9 code is a procedure — it must carry a time window, so an entry
  // without one (e.g. hospital data with blank times) is pre-filled with now
  const [form, setForm] = useState(() => ({
    ...entry,
    ...(isIcd9Type(entry.type) ? {
      operation_start: entry.operation_start ?? nowOperationTime(),
      operation_end: entry.operation_end ?? nowOperationTime(),
      operation_type: entry.operation_type ?? OPERATION_TYPES[0],
    } : {}),
  }));
  /** save with the window + type normalized to the final type: ICD-9 always
   *  has them (missing → now / OR Procedure), a diagnosis never does */
  const normalized = (): CodeEntry => isIcd9Type(form.type)
    ? { ...form,
        operation_start: form.operation_start ?? nowOperationTime(),
        operation_end: form.operation_end ?? nowOperationTime(),
        operation_type: form.operation_type ?? OPERATION_TYPES[0] }
    : { ...form, operation_start: undefined, operation_end: undefined,
        operation_type: undefined };
  const modalBg = gl.isDark ? "#1e1218" : "#ffffff";
  const fieldBg = gl.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const fieldBorder = `1px solid rgba(${gl.accentRgb},0.30)`;
  const focusRing = `1px solid rgba(${gl.accentRgb},0.65)`;
  const inputStyle: React.CSSProperties = { background: fieldBg, border: fieldBorder, color: gl.text, outline: "none", transition: "border 0.15s" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: gl.isDark ? "rgba(0,0,0,0.60)" : "rgba(0,0,0,0.40)" }} onClick={onClose}>
      <div className="w-[460px] rounded-2xl overflow-hidden"
        style={{ background: modalBg, border: `1.5px solid rgba(${gl.accentRgb},0.35)`, boxShadow: `0 24px 60px rgba(0,0,0,${gl.isDark ? "0.60" : "0.18"})` }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid rgba(${gl.accentRgb},0.15)`, background: `rgba(${gl.accentRgb},0.06)` }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: `rgba(${gl.accentRgb},0.15)`, border: `1px solid rgba(${gl.accentRgb},0.25)` }}>
              <Edit3 size={14} style={{ color: gl.accent }} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold" style={{ color: gl.text }}>Edit Code</h3>
              <p className="text-[11px]" style={{ color: gl.muted }}>Modify code details and type</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:opacity-70 transition-all"
            style={{ background: `rgba(${gl.accentRgb},0.10)`, border: `1px solid rgba(${gl.accentRgb},0.20)`, color: gl.muted }}>
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>Code Number</label>
              <CodeSearchField
                value={form.code}
                system={systemFromCodeType(form.type)}
                placeholder="Search ICD code…"
                inputStyle={inputStyle}
                localHits={localHits}
                onSelect={(hit) =>
                  setForm((f) => ({
                    ...f,
                    code: hit.code,
                    desc: hit.description || f.desc,
                    type: /icd[- ]?9/i.test(hit.system)
                      ? (f.type.toLowerCase().includes('comorbid') ? CODE_TYPE_COMORBIDITY : CODE_TYPE_PRIMARY)
                      : (f.type.toLowerCase().includes('comorbid')
                          ? CODE_TYPE_ICD10_COMORBIDITY
                          : CODE_TYPE_ICD10_PRIMARY),
                  }))
                }
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>Code Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full text-[13px] font-semibold px-3 py-2.5 rounded-xl appearance-none" style={inputStyle}>
                {CODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>Description</label>
            <textarea rows={4} value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
              onFocus={e => (e.target.style.border = focusRing)} onBlur={e => (e.target.style.border = fieldBorder)}
              className="w-full text-[13px] px-3 py-2.5 rounded-xl resize-none leading-relaxed" style={inputStyle} />
          </div>
          {/* per-code note, like the hospital UI's Note column — internal only */}
          <div>
            <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.noteLabel")}</label>
            <textarea rows={2} value={form.note ?? ""} placeholder={t("code.notePlaceholder")}
              onChange={e => setForm(f => ({ ...f, note: e.target.value || undefined }))}
              onFocus={e => (e.target.style.border = focusRing)} onBlur={e => (e.target.style.border = fieldBorder)}
              className="w-full text-[13px] px-3 py-2.5 rounded-xl resize-none leading-relaxed" style={inputStyle} />
          </div>
          {/* ICD-9 = procedure → its operation type + time window are editable here too */}
          {isIcd9Type(form.type) && (
            <div>
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.opType")}</label>
              <select value={form.operation_type ?? OPERATION_TYPES[0]}
                onChange={e => setForm(f => ({ ...f, operation_type: e.target.value }))}
                className="w-full text-[13px] font-semibold px-3 py-2.5 rounded-xl appearance-none" style={inputStyle}>
                {/* a hospital value outside our list still renders + round-trips */}
                {(OPERATION_TYPES.includes(form.operation_type ?? OPERATION_TYPES[0])
                  ? OPERATION_TYPES : [form.operation_type as string, ...OPERATION_TYPES])
                  .map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}
          {isIcd9Type(form.type) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.opStart")}</label>
                <input type="datetime-local" value={toInputValue(form.operation_start)}
                  onChange={e => setForm(f => ({ ...f, operation_start: fromInputValue(e.target.value) }))}
                  className="w-full text-[12px] px-2 py-2.5 rounded-xl" style={inputStyle} />
              </div>
              <div>
                <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.opEnd")}</label>
                <input type="datetime-local" value={toInputValue(form.operation_end)}
                  onChange={e => setForm(f => ({ ...f, operation_end: fromInputValue(e.target.value) }))}
                  className="w-full text-[12px] px-2 py-2.5 rounded-xl" style={inputStyle} />
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 flex gap-2.5"
          style={{ borderTop: `1px solid rgba(${gl.accentRgb},0.15)`, background: `rgba(${gl.accentRgb},0.03)` }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold hover:opacity-80 transition-all"
            style={{ border: `1.5px solid rgba(${gl.accentRgb},0.30)`, color: gl.text, background: "transparent" }}>Cancel</button>
          <button onClick={() => onSave(normalized())}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all"
            style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff", boxShadow: `0 4px 16px rgba(${gl.accentRgb},0.35)` }}>
            <Check size={13} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export function IncompleteCaseDetailPage({ caseData, onBack, onViewHistory }: {
  caseData: IncompleteCase | null;
  onBack: () => void;
  /** navigates to the ViewHistory page for this case (Prompt 4 Feature 5) */
  onViewHistory: (caseId: string, patientName: string) => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const { approvedIds, approve, reopen } = useApprovals();
  const { addLog } = useActivityLog();
  const { showToast } = useToast();
  const c = caseData ?? { id: "C-0043", patient: "Frank Okafor", dept: "Cardiology 3B", confidence: 57, missing: "Procedure specificity", group: "cardio" };
  const approved = approvedIds.has(c.id);
  // saved local edits/draft (POC persistence) win over both mock and fetched content;
  // without one, content stays empty until the fetch settles (loading placeholder)
  // item 9: the report is read-only now — Edit Report and its draft are gone
  const [report, setReport] = useState(() => loadReportDraft(c.id) ?? "");
  const [codes, setCodes] = useState<StoredCode[]>(() => loadCodeEdits(c.id) ?? []);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  // add / delete / approve dialogs (Prompt 4)
  const [adding, setAdding] = useState<CodeSystem | null>(null);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);

  const persistCodes = (next: StoredCode[]) => { setCodes(next); saveCodeEdits(c.id, next); };

  const handleAddCode = (entry: { code: string; type: string; desc: string;
                                  operation_start?: string; operation_end?: string;
                                  operation_type?: string; note?: string }) => {
    const added: StoredCode = { ...entry, confidence: 100, manual: true }; // coder-entered = fact
    persistCodes([...codes, added]);
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
    if (deletingIdx === null) return;
    const removed = codes[deletingIdx];
    persistCodes(codes.filter((_, i) => i !== deletingIdx));
    setDeletingIdx(null);
    const logId = addLog({
      userId: "sarah.k", userName: "Sarah K.", actionType: "DELETE_CODE",
      targetId: c.id, targetType: "code",
      description: `Deleted code ${removed.code} from ${c.patient}`,
      previousState: { caseId: c.id, code: removed },
    });
    showToast(`Deleted code ${removed.code} from ${c.patient}`, logId);
  };

  const handleApprove = () => {
    setConfirmingApprove(false);
    approve([c.id]);
    const n = codes.filter(x => !x.missing).length;
    const logId = addLog({
      userId: "sarah.k", userName: "Sarah K.", actionType: "APPROVE_CASE",
      targetId: c.id, targetType: "case",
      description: `Approved ${n} code(s) for ${c.patient}`,
      previousState: { caseIds: [c.id] },
    });
    showToast(`Approved ${n} code(s) for ${c.patient}`, logId);
  };

  // real report + codes from the synced iMed data, synced into the editable state
  // during render when the fetch settles; mock is the failure/empty fallback only,
  // never shown during the loading window
  const { detail, status } = useCaseDetail(caseData?.id);
  // starts at "loading" (not `status`) so a case with no id, whose status is
  // "error" from the first render, still enters the seeding block below
  const [prevStatus, setPrevStatus] = useState<typeof status>("loading");
  if (status !== prevStatus) {
    setPrevStatus(status);
    // precedence (same rule as CaseDetail): server-saved draft/edits (live
    // backend = shared truth) -> localStorage -> seed from fetched content -> mock
    if (status === "ready" && detail) {
      const savedDraft = detail.reportDraft ?? loadReportDraft(c.id);
      if (savedDraft !== null) {
        setReport(savedDraft);
      } else if (detail.sections.length > 0) {
        setReport(detail.sections
          .map(s => `[${s.fieldname}]  (${s.documenttype}${s.recorddatetime ? " · " + s.recorddatetime : ""})\n${s.value ?? "—"}`)
          .join("\n\n"));
      } else {
        setReport(initialReport);
      }
      const savedCodes = detail.codeEdits ?? loadCodeEdits(c.id);
      if (savedCodes) {
        setCodes(savedCodes);
      } else {
        const real = detail.codes.map(k => ({
          // role-bearing label, so the Edit dialog opens on the right type and
          // approve keeps the hospital's role (external cause / other included)
          code: k.code, type: codeTypeFromRole(k.code_system, k.code_role),
          desc: k.description ?? k.code,
          confidence: 100, // imported from iMed = fact, not AI guess
          // procedure time window + type (ICD-9 rows; the hospital's own record)
          operation_start: k.operation_start ?? undefined,
          operation_end: k.operation_end ?? undefined,
          operation_type: k.operation_type ?? undefined,
        }));
        const missingRows = (caseData?.missing ?? "")
          .split(",").map(m => m.trim()).filter(m => m && m !== "—")
          .map(m => ({
            code: "???", type: "ICD-10", desc: `${m} — not documented in the iMed record`,
            confidence: 0, missing: true, missingMsg: `Missing: ${m}`,
          }));
        setCodes(real.length + missingRows.length > 0 ? [...real, ...missingRows] : []);
      }
    } else if (status === "error") {
      // fetch failed -> graceful mock fallback (core design property, keep the demo alive)
      if (loadReportDraft(c.id) === null) setReport(initialReport);
      if (!loadCodeEdits(c.id)) setCodes(initialCodes);
    }
  }

  // Fill empty ICD-9 / ICD-10 columns from the RAG knowledge index.
  const [suggesting, setSuggesting] = useState(false);
  useEffect(() => {
    if (status !== "ready" || !c.id) return;
    let cancelled = false;
    setSuggesting(true);
    void (async () => {
      try {
        const ai = await suggestCodes(c.id);
        if (cancelled || !ai.length) return;
        setCodes((prev) => {
          const next = fillEmptySystems(prev, ai);
          if (next.length !== prev.length) saveCodeEdits(c.id, next);
          return next;
        });
      } catch {
        /* RAG down */
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status, c.id]);

  const loadingContent = status === "loading" && loadReportDraft(c.id) === null;

  // hospital-panel vs chronological record view (persisted, shared across pages)
  const [view, setView] = useReportView();
  const loadingCodes = (status === "loading" || suggesting) && codes.filter(x => !x.missing).length === 0;

  const missingCount = codes.filter(x => x.missing).length;

  const panel: React.CSSProperties = {
    background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20,
    border: gl.border, boxShadow: gl.shadow,
  };
  const dc = detail?.case;

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {editingIdx !== null && (
        <EditCodeModal
          entry={codes[editingIdx]}
          localHits={codes
            .filter((c) => !c.missing && c.code && c.code !== '???')
            .map((c) => ({
              code: c.code,
              system: /icd[- ]?9|pcs/i.test(c.type) ? 'ICD-9' : 'ICD-10',
              description: c.desc,
            }))}
          onSave={u => {
            // filling a real code into a "???" row resolves it: coder-entered = fact
            const before = codes[editingIdx];
            const filled = before.missing && u.code.trim() !== "" && !u.code.includes("?");
            const resolved: StoredCode = filled
              ? { ...u, missing: false, missingMsg: undefined, confidence: 100 }
              : { ...before, ...u };
            const next = codes.map((e, i) => i === editingIdx ? resolved : e);
            setCodes(next); saveCodeEdits(c.id, next); setEditingIdx(null);
            const logId = addLog({
              userId: "sarah.k", userName: "Sarah K.", actionType: "EDIT_CODE",
              targetId: c.id, targetType: "code",
              description: `Edited code ${before.code} → ${resolved.code} for ${c.patient}`,
              previousState: { caseId: c.id, before, after: resolved },
            });
            showToast(`Edited code ${before.code} → ${resolved.code} for ${c.patient}`, logId);
          }}
          onClose={() => setEditingIdx(null)}
        />
      )}
      {adding && <AddCodeModal only={adding} onAdd={handleAddCode} onClose={() => setAdding(null)} />}
      {deletingIdx !== null && (
        <ConfirmDialog
          icon={Trash2} danger
          title={t("confirm.deleteCode")}
          body={t("confirm.deleteCodeBody", { code: codes[deletingIdx].code })}
          confirmLabel={t("confirm.delete")}
          onConfirm={handleDeleteCode}
          onClose={() => setDeletingIdx(null)}
        />
      )}
      {confirmingApprove && (
        <ConfirmDialog
          icon={CheckCircle2}
          title={t("confirm.title")}
          body={t("confirm.approveCodesBody", { n: codes.filter(x => !x.missing).length, patientName: c.patient })}
          confirmLabel={t("btn.approve")}
          onConfirm={handleApprove}
          onClose={() => setConfirmingApprove(false)}
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
              HN {dc?.patient_ref ?? c.hn ?? "—"} · {c.dept}
            </p>
          </div>
          {/* the case's status sits with its identity, not with the actions */}
          {approved ? (
            <span className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full"
              style={{ background: `rgba(${gl.accentRgb},0.15)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.30)` }}>
              <BadgeCheck size={13} /> {t("detail.approvedOn", { date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" }) })}
            </span>
          ) : loadingContent ? null : (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full"
              style={{ background: `rgba(${gl.accentRgb},0.10)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.22)` }}>
              <AlertCircle size={12} />
              {missingCount > 0 ? t("detail.fieldsPending", { n: missingCount }) : t("detail.readyToApprove")}
            </span>
          )}
        </div>
        {/* actions at the top right */}
        <div className="flex items-center gap-2">
          <button onClick={() => onViewHistory(c.id, c.patient)}
            className="flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg hover:opacity-80 transition-all"
            style={{ background: "transparent", border: gl.border, color: gl.text }}>
            <Clock size={12} /> {t("btn.viewHistory")}
          </button>
          <button onClick={() => (approved ? reopen(c.id) : setConfirmingApprove(true))}
            className="flex items-center gap-1.5 text-[13px] font-bold px-4 py-2 rounded-lg hover:opacity-90 transition-all"
            style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff", boxShadow: `0 2px 10px rgba(${gl.accentRgb},0.25)` }}>
            {approved
              ? <><RotateCcw size={13} /> {t("detail.unapprove")}</>
              : <><CheckCircle2 size={13} /> {t("detail.approveAll")}</>}
          </button>
        </div>
      </header>

      <div className="flex-1 flex gap-4 p-5 overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden min-w-0" style={panel}>
          <div className="px-5 py-3.5 shrink-0 flex items-center justify-between" style={{ borderBottom: gl.borderSm }}>
            <div className="flex items-center gap-2">
              <FileText size={15} style={{ color: gl.accent }} />
              <h2 className="text-[17px] font-bold" style={{ color: gl.text }}>Discharge Report</h2>
            </div>
            {/* item 9: Edit Report removed */}
            <div className="flex items-center gap-2">
              <ReportViewToggle view={view} onChange={setView} />
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent }}>Read-only</span>
            </div>
          </div>
          <div className="px-5 py-3 shrink-0" style={{ borderBottom: gl.borderSm }}>
            <ReportHeader detail={detail} caseId={c.id} dept={c.dept} />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 scroll-thin">
            {/* hospital view = the record regrouped into the hospital's own
                panels; the chronological path below is unchanged */}
            {view === "hospital" && !loadingContent && detail ? (
              <HospitalPanels detail={detail} />
            ) : (<>
            {/* hospital vital signs above the note text, like the original coder UI */}
            {!loadingContent && <VitalsStrip detail={detail} />}
            {loadingContent ? (
              <ReportSkeleton />
            ) : (
              <HighlightedReport text={report} accentRgb={gl.accentRgb} accent={gl.accent} />
            )}
            {/* labs as a hospital-style results table, then the other orders */}
            {!loadingContent && <LabResults detail={detail} />}
            {/* item 8: orders / X-ray / operative rows behind this case */}
            {!loadingContent && <ReportOrders detail={detail} />}
            </>)}
          </div>
        </div>

        {/* three containers side by side: Report | ICD-10 | ICD-9 */}
        {(["icd10", "icd9"] as CodeSystem[]).map((sys) => {
          const filled = codes.some(
            (c) => (sys === "icd9") === isIcd9Type(c.type) && !c.missing && c.code !== "???",
          );
          return (
            <CodesColumn key={sys} system={sys}
              codes={codes}
              loading={loadingCodes || (suggesting && !filled)}
              onReorder={persistCodes}
              onEdit={setEditingIdx}
              onDelete={setDeletingIdx}
              onAdd={setAdding}
            />
          );
        })}
      </div>
    </main>
  );
}
