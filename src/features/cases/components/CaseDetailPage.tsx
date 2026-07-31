import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useState, useEffect } from "react";
import {
  FileText, CheckCircle2, BadgeCheck, Edit3, Check, ArrowLeft, X, RotateCcw,
  Trash2, Clock,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LanguageContext";
import { useApprovals } from "../context/ApprovalsContext";
import { useActivityLog } from "../context/ActivityLogContext";
import { useToast } from "../context/ToastContext";
import { useCaseDetail } from "../hooks/useCaseDetail";
import { suggestCodes } from "../api/casesService";
import { fillEmptySystems, isIcd9Type, codeTypeFromRole, hasIcd10Primary } from "../utils/aiSuggestions";
import { AddCodeModal, CODE_TYPE_PRIMARY, CODE_TYPE_COMORBIDITY,
         CODE_TYPE_ICD10_PRIMARY, CODE_TYPE_ICD10_COMORBIDITY,
         CODE_TYPE_ICD10_OTHER, CODE_TYPE_ICD10_EXTERNAL } from "./codes/AddCodeModal";
import { CodeSearchField, systemFromCodeType } from "./codes/CodeSearchField";
import { Field } from "./codes/Field";
import { ModalShell } from "../../../components/ui/Modal";
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
import type { CompleteCase, CodeEntry } from "../types/case.types";

const dischargeReport = `DISCHARGE SUMMARY

Patient was admitted with acute chest pain radiating to the left arm, accompanied by diaphoresis and shortness of breath. Initial ECG demonstrated ST-segment elevation in leads V1–V4, consistent with anterior ST-elevation myocardial infarction (STEMI).

The patient was urgently transferred to the cardiac catheterisation laboratory where coronary angiography revealed a total occlusion of the left anterior descending artery (LAD). Percutaneous coronary intervention (PCI) with drug-eluting stent placement was performed successfully with TIMI 3 flow restored post-procedure.

Medical history is significant for type 2 diabetes mellitus, managed with metformin 1000 mg twice daily, and hypertension, controlled with amlodipine 5 mg daily. HbA1c on admission was 8.4%, indicating suboptimal glycaemic control.

Post-procedure course was uncomplicated. The patient was monitored in the coronary care unit for 48 hours. Echocardiography revealed mildly reduced left ventricular ejection fraction (LVEF) of 45%, with anterior wall hypokinesia. No evidence of pericardial effusion or valvular abnormality.

The patient was commenced on dual antiplatelet therapy with aspirin 100 mg and ticagrelor 90 mg twice daily, high-intensity statin therapy with rosuvastatin 40 mg, ACE inhibitor ramipril 5 mg, and beta-blocker bisoprolol 2.5 mg.

Discharge condition: stable. Follow-up scheduled with cardiology in 2 weeks. Cardiac rehabilitation referral placed. Patient advised on lifestyle modification, smoking cessation, and dietary changes.`;

const highlights = [
  "acute chest pain", "ST-elevation myocardial infarction", "STEMI",
  "left anterior descending artery", "LAD", "percutaneous coronary intervention",
  "PCI", "drug-eluting stent", "type 2 diabetes mellitus",
  "hypertension", "left ventricular ejection fraction", "LVEF",
  "anterior wall hypokinesia", "dual antiplatelet therapy",
  "coronary angiography", "cardiac catheterisation",
];

function HighlightedReport({ text, accentRgb }: { text: string; accentRgb: string }) {
  const pattern = new RegExp(
    `(${highlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  const parts = text.split(pattern);
  return (
    <p className="text-[13px] leading-7 whitespace-pre-wrap">
      {parts.map((part, i) =>
        highlights.some(h => h.toLowerCase() === part.toLowerCase())
          ? <mark key={i} style={{ background: `rgba(${accentRgb},0.18)`, color: "inherit", borderRadius: "3px", padding: "0 3px" }}>{part}</mark>
          : part
      )}
    </p>
  );
}

// the allowed code types, per system (item 11 — same as the Add Code dialog;
// ICD-10 carries the hospital dropdown's four diagnosis kinds)
const CODE_TYPES = [CODE_TYPE_ICD10_PRIMARY, CODE_TYPE_ICD10_COMORBIDITY,
                    CODE_TYPE_ICD10_OTHER, CODE_TYPE_ICD10_EXTERNAL,
                    CODE_TYPE_PRIMARY, CODE_TYPE_COMORBIDITY];

function EditCodeModal({ entry, onSave, onClose, localHits, icd10PrimaryTaken }: {
  entry: CodeEntry
  onSave: (u: CodeEntry) => void
  onClose: () => void
  localHits?: { code: string; system: string; description: string }[]
  /** ANOTHER row already holds the primary ICD-10 — only one per case */
  icd10PrimaryTaken?: boolean
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  // an ICD-9 code is a procedure — it must carry a time window, so an entry
  // without one (e.g. hospital data with blank times) is pre-filled with now
  const [form, setForm] = useState<CodeEntry>(() => ({
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
              <p className="text-[12px] font-normal" style={{ color: gl.muted }}>Modify code details and type</p>
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

const defaultCodes: CodeEntry[] = [
  { code: "I21.09",  type: "ICD-10",     desc: "ST elevation myocardial infarction of other coronary artery",   confidence: 96 },
  { code: "I25.10",  type: "ICD-10",     desc: "Atherosclerotic heart disease of native coronary artery",        confidence: 88 },
  { code: "E11.65",  type: "ICD-10",     desc: "Type 2 diabetes mellitus with hyperglycaemia",                   confidence: 84 },
  { code: "I10",     type: "ICD-10",     desc: "Essential (primary) hypertension",                               confidence: 91 },
  { code: "Z95.5",   type: "ICD-10",     desc: "Presence of coronary angioplasty implant and graft",             confidence: 79 },
  { code: "02703ZZ", type: "ICD-10-PCS", desc: "Dilation of coronary artery, percutaneous approach",             confidence: 93 },
  { code: "DRG-247", type: "DRG",        desc: "Percutaneous cardiovascular procedure with drug-eluting stent",  confidence: 91 },
];

export function CaseDetailPage({ caseData, onBack, onViewHistory }: {
  caseData: CompleteCase | null;
  onBack: () => void;
  /** navigates to the ViewHistory page for this case */
  onViewHistory: (caseId: string, patientName: string) => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const { approvedIds, approve, reopen } = useApprovals();
  useDocumentTitle(caseData ? `Case ${caseData.vn ?? caseData.id}` : null);
  const { addLog } = useActivityLog();
  const { showToast } = useToast();
  const c = caseData ?? { id: "C-0041", patient: "Margaret Liu", dept: "Cardiology", group: "Cardiovascular", confidence: 94 };
  const approved = approvedIds.has(c.id);
  // saved local edits (POC persistence) win over both mock and fetched codes;
  // without one, codes stay empty until the fetch settles (loading placeholder)
  const [codes, setCodes] = useState<StoredCode[]>(() => loadCodeEdits(c.id) ?? []);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  // add / delete / approve dialogs (parity with IncompleteCaseDetail)
  const [adding, setAdding] = useState<CodeSystem | null>(null);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  // meeting item 9: the report is no longer editable in the app — it is the
  // hospital's clinical record. A draft saved before that change still wins
  // over the synced sections, so nobody's saved work disappears.
  const [report] = useState(() => loadReportDraft(c.id) ?? "");

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
    const logId = addLog({
      userId: "sarah.k", userName: "Sarah K.", actionType: "APPROVE_CASE",
      targetId: c.id, targetType: "case",
      description: `Approved ${codes.length} code(s) for ${c.patient}`,
      previousState: { caseIds: [c.id] },
    });
    showToast(`Approved ${codes.length} code(s) for ${c.patient}`, logId);
  };

  // real report content from the synced iMed data (feedback item 6), synced into the
  // editable codes state during render when the fetch settles; mock is the
  // failure/empty fallback only, never shown during the loading window
  const { detail, status } = useCaseDetail(caseData?.id);
  // starts at "loading" (not `status`) so a case with no id, whose status is
  // "error" from the first render, still enters the seeding block below
  const [prevStatus, setPrevStatus] = useState<typeof status>("loading");
  if (status !== prevStatus) {
    setPrevStatus(status);
    // precedence: server-saved edits (live backend = shared truth, may hold
    // another session's work) -> localStorage -> seed from fetched codes ->
    // mock. The initial useState may briefly show local codes until the
    // fetch settles — cosmetic, the server copy replaces them here.
    const saved = (status === "ready" ? detail?.codeEdits : null) ?? loadCodeEdits(c.id);
    if (saved) {
      setCodes(saved);
    } else if (status === "ready" && detail && detail.codes.length > 0) {
      setCodes(detail.codes.map((k) => ({
        code: k.code,
        // role-bearing label, so the Edit dialog opens on the right type and
        // approve keeps the hospital's role (external cause / other included)
        type: codeTypeFromRole(k.code_system, k.code_role),
        desc: `${k.description ?? ""}${k.code_role ? ` · ${k.code_role.replace(/_/g, " ")}` : ""}` || k.code,
        confidence: k.source === "imported_from_imed" ? 100 : 85, // imported codes are facts, not AI guesses
        // procedure time window + type (ICD-9 rows; the hospital's own record)
        operation_start: k.operation_start ?? undefined,
        operation_end: k.operation_end ?? undefined,
        operation_type: k.operation_type ?? undefined,
      })));
    } else if (status === "ready") {
      // no iMed codes — leave empty; RAG suggest effect fills the columns
      setCodes([]);
    } else if (status !== "loading") {
      // fetch failed -> graceful mock fallback
      setCodes(defaultCodes);
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
        /* RAG down — columns stay as iMed/empty */
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status, c.id]);

  const loadingCodes = (status === "loading" || suggesting) && codes.length === 0;

  // hospital-panel vs chronological record view (persisted, shared across pages)
  const [view, setView] = useReportView();

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
            const before = codes[editingIdx];
            const next = codes.map((e, i) => i === editingIdx ? { ...before, ...u } : e);
            setCodes(next); saveCodeEdits(c.id, next); setEditingIdx(null);
            const logId = addLog({
              userId: "sarah.k", userName: "Sarah K.", actionType: "EDIT_CODE",
              targetId: c.id, targetType: "code",
              description: `Edited code ${before.code} → ${u.code} for ${c.patient}`,
              previousState: { caseId: c.id, before, after: { ...before, ...u } },
            });
            showToast(`Edited code ${before.code} → ${u.code} for ${c.patient}`, logId);
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
          body={t("confirm.approveCodesBody", { n: codes.length, patientName: c.patient })}
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
          {/* item 2: the case is identified by VN / HN, not by a display name */}
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
          ) : (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full"
              style={{ background: `rgba(${gl.accentRgb},0.07)`, color: gl.muted, border: `1px solid rgba(${gl.accentRgb},0.15)` }}>
              <CheckCircle2 size={12} /> {t("detail.pending")}
            </span>
          )}
        </div>
        {/* the case's actions live at the top right */}
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
          <div className="px-5 py-4 shrink-0"
            style={{ borderBottom: `1px solid rgba(${gl.accentRgb},${gl.isDark ? 0.22 : 0.16})` }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={15} style={{ color: gl.accent }} />
              <h2 className="text-[17px] font-bold flex-1" style={{ color: gl.text }}>Discharge Report</h2>
              <ReportViewToggle view={view} onChange={setView} />
              {/* item 9: Edit Report removed — the record is read-only here */}
              <span className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent }}>Read-only</span>
            </div>
            <ReportHeader detail={detail} caseId={c.id} dept={c.dept} />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 scroll-thin" style={{ color: gl.text }}>
            {/* hospital view = the same record regrouped into the panels the
                hospital's own coder UI shows; chronological view below is
                unchanged and keeps the day-by-day document order */}
            {view === "hospital" && status !== "loading" && detail ? (
              <HospitalPanels detail={detail} />
            ) : (<>
            {/* hospital vital signs above the note sections, like the original coder UI */}
            {status !== "loading" && <VitalsStrip detail={detail} />}
            {status === "loading" ? (
              <ReportSkeleton />
            ) : report !== "" ? (
              /* the coder's saved draft wins over the synced sections */
              <HighlightedReport text={report} accentRgb={gl.accentRgb} />
            ) : detail && detail.sections.length > 0 ? (
              /* real report sections from iMed MedHack_MedicalRecord (feedback item 6) */
              <div>
                {detail.sections.map((s, i) => (
                  // accent-tinted divider between entries — opacity tuned per
                  // light/dark so the break reads clearly in every theme
                  <div key={i} className={i > 0 ? "mt-4 pt-4" : ""}
                    style={i > 0 ? { borderTop: `1px solid rgba(${gl.accentRgb},${gl.isDark ? 0.22 : 0.16})` } : undefined}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: gl.accent }}>{s.fieldname}</span>
                      <span className="text-[12px] font-normal" style={{ color: gl.muted }}>{s.documenttype}{s.recorddatetime ? ` · ${s.recorddatetime}` : ""}</span>
                    </div>
                    <p className="text-[14px] leading-6 whitespace-pre-wrap">{s.value ?? "—"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <HighlightedReport text={dischargeReport} accentRgb={gl.accentRgb} />
            )}
            {/* labs as a hospital-style results table, then the other orders */}
            {status !== "loading" && <LabResults detail={detail} />}
            {/* item 8: the orders/results behind the case, in the report */}
            {status !== "loading" && <ReportOrders detail={detail} />}
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
