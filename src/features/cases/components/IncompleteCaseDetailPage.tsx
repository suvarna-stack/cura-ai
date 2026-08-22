import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useState, useEffect } from "react";
import {
  FileText, CheckCircle2, BadgeCheck, AlertCircle,
  Edit3, ArrowLeft, X, Check, RotateCcw, Trash2, Clock,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LanguageContext";
import { useApprovals } from "../context/ApprovalsContext";
import { useActivityLog } from "../context/ActivityLogContext";
import { useCoderIdentity } from "../hooks/useCoderIdentity";
import { useToast } from "../context/ToastContext";
import { useCaseDetail } from "../hooks/useCaseDetail";
import { suggestCodes, type SuggestedNote } from "../api/casesService";
import { fillEmptySystems, isIcd9Type, codeTypeFromRole, hasIcd10Primary } from "../utils/aiSuggestions";
import { AddCodeModal, CODE_TYPE_PRIMARY, CODE_TYPE_COMORBIDITY,
         CODE_TYPE_ICD10_PRIMARY, CODE_TYPE_ICD10_COMORBIDITY,
         CODE_TYPE_ICD10_OTHER, CODE_TYPE_ICD10_EXTERNAL } from "./codes/AddCodeModal";
import { CodeSearchField, systemFromCodeType } from "./codes/CodeSearchField";
import { Field } from "./codes/Field";
import { ModalShell } from "../../../components/ui/Modal";
import { CodesColumn } from "./codes/CodesColumn";
import type { CodeSystem } from "./codes/CodesColumn";
import { ConfirmDialog } from "./global/ConfirmDialog";
import { ReportHeader } from "./global/ReportHeader";
import { ReportOrders } from "./global/ReportOrders";
import { VitalsStrip } from "./global/VitalsStrip";
import { LabResults } from "./global/LabResults";
import { HospitalPanels, ReportViewToggle, useReportView } from "./global/HospitalPanels";
import { ReportSkeleton } from "./global/DetailSkeletons";
import { loadCodeEdits, saveCodeEdits, type StoredCode } from "../utils/caseLocal";
import { pickedCount, unpickedCount, setPicked, toggleAt, withSelectionDefaults } from "../utils/codeSelection";
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

/** Which column a "not documented" gap row belongs in. The row carries no real
 *  code, so its system can only come from the field it is about — the backend's
 *  missing label ("ICD-9 procedure codes" / "ICD-10 diagnosis codes"). */
const gapType = (label: string) => (isIcd9Type(label) ? "ICD-9" : "ICD-10");

/** Payloads saved before 2026-08-22 typed EVERY gap row "ICD-10", so an ICD-9
 *  gap sat in the diagnosis column. Move those on load — saved data is not
 *  migrated by a rule change, so the reader fixes it. Only the mistyped ICD-9
 *  gaps are touched; every other row keeps the exact type it was saved with. */
const retypeGapRows = (codes: StoredCode[]): StoredCode[] =>
  codes.map((k) => (k.missing && !isIcd9Type(k.type ?? "")
                    && isIcd9Type(k.missingMsg ?? k.desc ?? "")
    ? { ...k, type: "ICD-9" }
    : k));

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

function EditCodeModal({ entry, onSave, onClose, localHits, icd10PrimaryTaken }: {
  entry: CodeEntry & { missing?: boolean; missingMsg?: string };
  onSave: (u: CodeEntry) => void;
  onClose: () => void;
  localHits?: { code: string; system: string; description: string }[];
  /** ANOTHER row already holds the primary ICD-10 — only one per case */
  icd10PrimaryTaken?: boolean;
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
  const inputStyle: React.CSSProperties = { background: fieldBg, border: fieldBorder, color: gl.text, transition: "border 0.15s" };
  return (
    <ModalShell onClose={onClose} ariaLabel="Edit Code"
      overlayClassName=""
      overlayStyle={{ background: gl.isDark ? "rgba(0,0,0,0.60)" : "rgba(0,0,0,0.40)" }}
      className="w-[460px] rounded-2xl overflow-hidden"
      style={{ background: modalBg, border: `1.5px solid rgba(${gl.accentRgb},0.35)`, boxShadow: `0 24px 60px rgba(0,0,0,${gl.isDark ? "0.60" : "0.18"})` }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid rgba(${gl.accentRgb},0.15)`, background: `rgba(${gl.accentRgb},0.06)` }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: `rgba(${gl.accentRgb},0.15)`, border: `1px solid rgba(${gl.accentRgb},0.25)` }}>
              <Edit3 size={14} style={{ color: gl.accent }} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold" style={{ color: gl.text }}>Edit Code</h3>
              <p className="text-[12px]" style={{ color: gl.muted }}>Modify code details and type</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t("a11y.close")}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:opacity-70 transition-all"
            style={{ background: `rgba(${gl.accentRgb},0.10)`, border: `1px solid rgba(${gl.accentRgb},0.20)`, color: gl.muted }}>
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code Number">
              {(id) => (
                <CodeSearchField
                  id={id}
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
                        : (f.type.toLowerCase().includes('comorbid') || icd10PrimaryTaken
                            ? CODE_TYPE_ICD10_COMORBIDITY
                            : CODE_TYPE_ICD10_PRIMARY),
                    }))
                  }
                />
              )}
            </Field>
            <Field label="Code Type">
              {(id) => (
                <select id={id} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full text-[13px] font-semibold px-3 py-2.5 rounded-xl appearance-none" style={inputStyle}>
                  {CODE_TYPES.map(ct => {
                    const taken = ct === CODE_TYPE_ICD10_PRIMARY && !!icd10PrimaryTaken;
                    return <option key={ct} value={ct} disabled={taken}>{ct}{taken ? t("code.primaryTaken") : ""}</option>;
                  })}
                </select>
              )}
            </Field>
          </div>
          <Field label="Description">
            {(id) => (
              <textarea id={id} rows={4} value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                onFocus={e => (e.target.style.border = focusRing)} onBlur={e => (e.target.style.border = fieldBorder)}
                className="w-full text-[13px] px-3 py-2.5 rounded-xl resize-none leading-relaxed" style={inputStyle} />
            )}
          </Field>
          {/* per-code note, like the hospital UI's Note column — internal only */}
          <Field label={t("code.noteLabel")}>
            {(id) => (
              <textarea id={id} rows={2} value={form.note ?? ""} placeholder={t("code.notePlaceholder")}
                onChange={e => setForm(f => ({ ...f, note: e.target.value || undefined }))}
                onFocus={e => (e.target.style.border = focusRing)} onBlur={e => (e.target.style.border = fieldBorder)}
                className="w-full text-[13px] px-3 py-2.5 rounded-xl resize-none leading-relaxed" style={inputStyle} />
            )}
          </Field>
          {/* ICD-9 = procedure → its operation type + time window are editable here too */}
          {isIcd9Type(form.type) && (
            <Field label={t("code.opType")}>
              {(id) => (
                <select id={id} value={form.operation_type ?? OPERATION_TYPES[0]}
                  onChange={e => setForm(f => ({ ...f, operation_type: e.target.value }))}
                  className="w-full text-[13px] font-semibold px-3 py-2.5 rounded-xl appearance-none" style={inputStyle}>
                  {/* a hospital value outside our list still renders + round-trips */}
                  {(OPERATION_TYPES.includes(form.operation_type ?? OPERATION_TYPES[0])
                    ? OPERATION_TYPES : [form.operation_type as string, ...OPERATION_TYPES])
                    .map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </Field>
          )}
          {isIcd9Type(form.type) && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("code.opStart")}>
                {(id) => (
                  <input id={id} type="datetime-local" value={toInputValue(form.operation_start)}
                    onChange={e => setForm(f => ({ ...f, operation_start: fromInputValue(e.target.value) }))}
                    className="w-full text-[12px] px-2 py-2.5 rounded-xl" style={inputStyle} />
                )}
              </Field>
              <Field label={t("code.opEnd")}>
                {(id) => (
                  <input id={id} type="datetime-local" value={toInputValue(form.operation_end)}
                    onChange={e => setForm(f => ({ ...f, operation_end: fromInputValue(e.target.value) }))}
                    className="w-full text-[12px] px-2 py-2.5 rounded-xl" style={inputStyle} />
                )}
              </Field>
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
    </ModalShell>
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
  useDocumentTitle(caseData ? `Case ${caseData.vn ?? caseData.id}` : null);
  const { addLog } = useActivityLog();
  const me = useCoderIdentity();
  const { showToast } = useToast();
  const c = caseData ?? { id: "C-0043", patient: "Frank Okafor", dept: "Cardiology 3B", confidence: 57, missing: "Procedure specificity", group: "cardio" };
  const approved = approvedIds.has(c.id);
  // item 9: the report is read-only — it renders straight from the synced
  // hospital record once the fetch settles (drafts were removed entirely)
  const [report, setReport] = useState("");
  const [codes, setCodes] = useState<StoredCode[]>(() => loadCodeEdits(c.id) ?? []);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  // add / delete / approve dialogs (Prompt 4)
  const [adding, setAdding] = useState<CodeSystem | null>(null);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  // un-approving withdraws codes already written back to iMed, so it is gated
  // exactly like approving is — the shared button flips between the two
  const [confirmingUnapprove, setConfirmingUnapprove] = useState(false);

  const handleUnapprove = () => {
    setConfirmingUnapprove(false);
    reopen(c.id);
    const logId = addLog({
      userId: me.userId, userName: me.userName, actionType: "REOPEN_CASE",
      targetId: c.id, targetType: "case",
      description: `Reopened case for ${c.patient}`, previousState: null,
    });
    showToast(`Reopened case for ${c.patient}`, logId);
  };

  const persistCodes = (next: StoredCode[]) => { setCodes(next); saveCodeEdits(c.id, next); };

  // selection-first review (2026-08-07): the coder ticks the codes to approve.
  // "???" placeholder rows can't be ticked at all until they're filled in.
  const picked = pickedCount(codes);
  const unpicked = unpickedCount(codes);
  const toggleCode = (index: number) => persistCodes(toggleAt(codes, index));
  const toggleMany = (indices: number[], next: boolean) => persistCodes(setPicked(codes, indices, next));

  const handleAddCode = (entry: { code: string; type: string; desc: string;
                                  operation_start?: string; operation_end?: string;
                                  operation_type?: string; note?: string }) => {
    // coder-entered = fact, and typing a code IS picking it — pre-ticked
    const added: StoredCode = { ...entry, confidence: 100, manual: true, origin: "manual", selected: true };
    // prepend: manual codes display grouped on top, and the saved order must
    // match what's shown (approve reads array order for the principal pick)
    persistCodes([added, ...codes]);
    setAdding(null);
    const logId = addLog({
      userId: me.userId, userName: me.userName, actionType: "ADD_CODE",
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
      userId: me.userId, userName: me.userName, actionType: "DELETE_CODE",
      targetId: c.id, targetType: "code",
      description: `Deleted code ${removed.code} from ${c.patient}`,
      previousState: { caseId: c.id, code: removed },
    });
    showToast(`Deleted code ${removed.code} from ${c.patient}`, logId);
  };

  const handleApprove = () => {
    setConfirmingApprove(false);
    approve([c.id]);
    const n = picked; // only the ticked codes are sent
    const logId = addLog({
      userId: me.userId, userName: me.userName, actionType: "APPROVE_CASE",
      targetId: c.id, targetType: "case",
      description: `Approved ${n} code(s) for ${c.patient}`,
      previousState: { caseIds: [c.id] },
    });
    showToast(`Approved ${n} code(s) for ${c.patient}`, logId);
    onBack(); // the case leaves this list on approval — return to the dashboard
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
    // precedence (same rule as CaseDetail): server-saved edits (live
    // backend = shared truth) -> session cache -> seed from fetched content -> mock
    if (status === "ready" && detail) {
      if (detail.sections.length > 0) {
        setReport(detail.sections
          .map(s => `[${s.fieldname}]  (${s.documenttype}${s.recorddatetime ? " · " + s.recorddatetime : ""})\n${s.value ?? "—"}`)
          .join("\n\n"));
      } else {
        setReport(initialReport);
      }
      const savedCodes = detail.codeEdits ?? loadCodeEdits(c.id);
      if (savedCodes) {
        // payloads saved before the tick-to-approve flow keep the coder's own
        // codes ticked; the rest wait to be picked (withSelectionDefaults)
        setCodes(retypeGapRows(withSelectionDefaults(savedCodes)));
      } else {
        const real = detail.codes.map(k => ({
          // role-bearing label, so the Edit dialog opens on the right type and
          // approve keeps the hospital's role (external cause / other included)
          code: k.code, type: codeTypeFromRole(k.code_system, k.code_role),
          desc: k.description ?? k.code,
          confidence: 100, // imported from iMed = fact, not AI guess
          // which group the card renders in; a hospital row shows no % at all
          origin: k.source === "imported_from_imed" ? "hospital" as const : "manual" as const,
          // procedure time window + type (ICD-9 rows; the hospital's own record)
          operation_start: k.operation_start ?? undefined,
          operation_end: k.operation_end ?? undefined,
          operation_type: k.operation_type ?? undefined,
        }));
        const missingRows = (caseData?.missing ?? "")
          .split(",").map(m => m.trim()).filter(m => m && m !== "—")
          .map(m => ({
            // the gap lands in the column it is about: "ICD-9 procedure codes"
            // belongs beside the procedures, not beside the diagnoses. Same
            // regex the columns filter by (aiSuggestions.isIcd9Type), so a
            // label naming ICD-9 / PCS can never render in the ICD-10 column.
            code: "???", type: gapType(m),
            desc: `${m} — not documented in the iMed record`,
            confidence: 0, missing: true, missingMsg: `Missing: ${m}`,
          }));
        setCodes(real.length + missingRows.length > 0 ? [...real, ...missingRows] : []);
      }
    } else if (status === "error") {
      // fetch failed -> graceful mock fallback (core design property, keep the demo alive)
      setReport(initialReport);
      if (!loadCodeEdits(c.id)) setCodes(initialCodes);
    }
  }

  // Fill empty ICD-9 / ICD-10 columns from the RAG knowledge index.
  const [suggesting, setSuggesting] = useState(false);
  // Coder-taught rules (Suggest & Learn) that match this case's narrative.
  const [aiNotes, setAiNotes] = useState<SuggestedNote[]>([]);
  useEffect(() => {
    if (status !== "ready" || !c.id) return;
    let cancelled = false;
    setSuggesting(true);
    void (async () => {
      try {
        const ai = await suggestCodes(c.id);
        if (cancelled) return;
        setAiNotes(ai.notes);
        if (!ai.codes.length) return;
        setCodes((prev) => {
          const next = fillEmptySystems(prev, ai.codes);
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

  const loadingContent = status === "loading";

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
          icd10PrimaryTaken={hasIcd10Primary(codes, editingIdx)}
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
              // resolving a "???" row means the coder typed the code themselves,
              // so it is ticked for approval like any hand-added code
              ? { ...u, missing: false, missingMsg: undefined, confidence: 100, selected: true }
              : { ...before, ...u };
            const next = codes.map((e, i) => i === editingIdx ? resolved : e);
            setCodes(next); saveCodeEdits(c.id, next); setEditingIdx(null);
            const logId = addLog({
              userId: me.userId, userName: me.userName, actionType: "EDIT_CODE",
              targetId: c.id, targetType: "code",
              description: `Edited code ${before.code} → ${resolved.code} for ${c.patient}`,
              previousState: { caseId: c.id, before, after: resolved },
            });
            showToast(`Edited code ${before.code} → ${resolved.code} for ${c.patient}`, logId);
          }}
          onClose={() => setEditingIdx(null)}
        />
      )}
      {adding && <AddCodeModal only={adding} icd10PrimaryTaken={hasIcd10Primary(codes)}
        onAdd={handleAddCode} onClose={() => setAdding(null)} />}
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
          body={t("confirm.approveCodesBody", { n: picked, patientName: c.patient })
                + (unpicked > 0 ? t("confirm.approveSkipped", { n: unpicked }) : "")}
          confirmLabel={t("btn.approve")}
          onConfirm={handleApprove}
          onClose={() => setConfirmingApprove(false)}
        />
      )}

      {confirmingUnapprove && (
        <ConfirmDialog
          icon={RotateCcw} danger
          title={t("confirm.unapprove.title")}
          body={t("confirm.unapprove.body", { patientName: c.patient })}
          confirmLabel={t("detail.unapprove")}
          onConfirm={handleUnapprove}
          onClose={() => setConfirmingUnapprove(false)}
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
          {/* approve sends the ticked codes only — blocked (with the reason)
              while nothing is ticked, rather than finalizing an empty case */}
          <button onClick={() => (approved ? setConfirmingUnapprove(true) : setConfirmingApprove(true))}
            disabled={!approved && picked === 0}
            title={!approved && picked === 0 ? t("code.pickNone") : undefined}
            className="flex items-center gap-1.5 text-[13px] font-bold px-4 py-2 rounded-lg hover:opacity-90 transition-all disabled:cursor-not-allowed"
            style={!approved && picked === 0
              ? { background: `rgba(${gl.accentRgb},0.10)`, color: gl.muted, border: `1px solid rgba(${gl.accentRgb},0.20)` }
              : { background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff", boxShadow: `0 2px 10px rgba(${gl.accentRgb},0.25)` }}>
            {approved
              ? <><RotateCcw size={13} /> {t("detail.unapprove")}</>
              : <><CheckCircle2 size={13} /> {picked > 0 ? t("detail.approveN", { n: picked }) : t("detail.approveAll")}</>}
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
              notes={aiNotes}
              loading={loadingCodes || (suggesting && !filled)}
              onReorder={persistCodes}
              onEdit={setEditingIdx}
              onDelete={setDeletingIdx}
              onAdd={setAdding}
              onToggle={toggleCode}
              onToggleAll={toggleMany}
            />
          );
        })}
      </div>
    </main>
  );
}
