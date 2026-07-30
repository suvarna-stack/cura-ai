// ============================================================
// "+ Add Code" modal (Prompt 4 Feature 1, reworked for meeting
// item 11): ICD-10 and ICD-9 are entered in two separate boxes
// side by side, mirroring the AI Suggested Codes panel — the
// coder picks the box, not a code system from a dropdown.
// Each side offers the same two roles as before: primary
// diagnosis and comorbidity. Code number is a catalog search.
// ============================================================
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { CodeSearchField } from "./CodeSearchField";
import { nowOperationTime, toInputValue, fromInputValue, OPERATION_TYPES } from "../../utils/operationTime";

// canonical stored values — the dropdown shows the translated labels.
// The code system is part of the type so CodesPanel can file the card in
// the right box and writeback.py can derive the role.
export const CODE_TYPE_PRIMARY = "ICD-9 Primary Diagnosis";
// was the bare legacy "Comorbidities", which the column filter (isIcd9) and the
// backend both read as ICD-10 — an ICD-9 comorbidity would jump columns and
// drop its operation time window. Rows saved with the old label keep the
// legacy ICD-10 treatment on both sides, consistently.
export const CODE_TYPE_COMORBIDITY = "ICD-9 Comorbidity";
export const CODE_TYPE_ICD10_PRIMARY = "ICD-10 Primary Diagnosis";
export const CODE_TYPE_ICD10_COMORBIDITY = "ICD-10 Comorbidity";
// the hospital dropdown's other two diagnosis kinds (2026-07-30) — the backend
// reads "…other…" / "…external…" in the label, and the write API's diagnosis
// types (OTHERS / EXTERNAL_CAUSE_OF_INJURY) have existed all along
export const CODE_TYPE_ICD10_OTHER = "ICD-10 Other";
export const CODE_TYPE_ICD10_EXTERNAL = "ICD-10 External Cause";

type SystemKey = "icd10" | "icd9";
type RoleKey = "primary" | "comorbidity" | "other" | "external";

const SYSTEMS: { key: SystemKey; label: string; placeholder: string; descPlaceholder: string;
                 roles: Partial<Record<RoleKey, string>>; catalog: "ICD-10" | "ICD-9" }[] = [
  // ICD-10 offers the hospital dropdown's four diagnosis kinds; ICD-9 keeps
  // two (a procedure's own type is the Operation Type dropdown below)
  { key: "icd10", label: "ICD-10", placeholder: "Search ICD-10…", descPlaceholder: "Acute myocardial infarction",
    roles: { primary: CODE_TYPE_ICD10_PRIMARY, comorbidity: CODE_TYPE_ICD10_COMORBIDITY,
             other: CODE_TYPE_ICD10_OTHER, external: CODE_TYPE_ICD10_EXTERNAL }, catalog: "ICD-10" },
  { key: "icd9",  label: "ICD-9",  placeholder: "Search ICD-9…", descPlaceholder: "Atrial fibrillation",
    roles: { primary: CODE_TYPE_PRIMARY, comorbidity: CODE_TYPE_COMORBIDITY }, catalog: "ICD-9" },
];

export function AddCodeModal({
  onAdd, onClose, only,
}: {
  onAdd: (entry: { code: string; type: string; desc: string;
                   operation_start?: string; operation_end?: string;
                   operation_type?: string; note?: string }) => void;
  onClose: () => void;
  /** opened from one box's "+": show only that code system */
  only?: SystemKey;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  // one independent draft per box; the coder fills the one they need.
  // ICD-9 = procedure, so its box carries a time window — pre-filled with
  // "now" (a procedure must have times; the coder corrects them).
  const [form, setForm] = useState<Record<SystemKey, { code: string; desc: string; role: RoleKey;
                                                      start: string; end: string; opType: string; note: string }>>(() => {
    const now = nowOperationTime();
    return {
      icd10: { code: "", desc: "", role: "primary", start: now, end: now, opType: OPERATION_TYPES[0], note: "" },
      icd9:  { code: "", desc: "", role: "primary", start: now, end: now, opType: OPERATION_TYPES[0], note: "" },
    };
  });
  const boxes = only ? SYSTEMS.filter((s) => s.key === only) : SYSTEMS;
  const filled = (k: SystemKey) => form[k].code.trim() !== "" && form[k].desc.trim() !== "";
  const ready = boxes.filter((s) => filled(s.key));

  const fieldStyle: React.CSSProperties = {
    background: gl.inputBg, border: `1px solid rgba(${gl.accentRgb},0.30)`, color: gl.text, outline: "none",
  };

  const submit = () => {
    // both boxes may be filled — each becomes its own code; only the ICD-9
    // (procedure) side carries the operation window
    for (const s of ready) {
      const f = form[s.key];
      onAdd({
        code: f.code.trim(),
        type: s.roles[f.role] ?? s.roles.primary!,
        desc: f.desc.trim(),
        ...(s.key === "icd9" ? { operation_start: f.start, operation_end: f.end,
                                 operation_type: f.opType } : {}),
        ...(f.note.trim() ? { note: f.note.trim() } : {}),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      onClick={onClose}>
      <div className={`w-full ${only ? "max-w-sm" : "max-w-2xl"} rounded-2xl p-5`}
        onClick={e => e.stopPropagation()}
        style={{
          background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20,
          border: `1px solid rgba(${gl.accentRgb},0.25)`, boxShadow: gl.shadow,
        }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: `rgba(${gl.accentRgb},0.15)`, color: gl.accent }}>
            <Plus size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold" style={{ color: gl.text }}>{t("confirm.addCode")}</h3>
            <p className="text-[11px] font-normal" style={{ color: gl.muted }}>{only ? "" : t("code.addHint")}</p>
          </div>
          <button onClick={onClose} className="hover:opacity-70 transition-all" style={{ color: gl.muted }}>
            <X size={15} />
          </button>
        </div>

        {/* the two code systems, side by side (item 11) */}
        <div className="flex items-start gap-3 mb-4">
          {boxes.map((s) => (
            <div key={s.key} className="flex-1 min-w-0 rounded-xl p-3 space-y-3"
              style={{ background: `rgba(${gl.accentRgb},0.04)`, border: `1px solid rgba(${gl.accentRgb},0.16)` }}>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: gl.accent }}>{s.label}</span>
                <span className="text-[10px] font-normal" style={{ color: gl.muted }}>
                  {s.key === "icd10" ? t("code.icd10Box") : t("code.icd9Box")}
                </span>
              </div>
              <div>
                <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.codeLabel")}</label>
                <CodeSearchField
                  value={form[s.key].code}
                  system={s.catalog}
                  placeholder={s.placeholder}
                  inputStyle={fieldStyle}
                  onSelect={(hit) =>
                    setForm((f) => ({
                      ...f,
                      [s.key]: {
                        ...f[s.key],
                        code: hit.code,
                        desc: hit.description || f[s.key].desc,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.typeLabel")}</label>
                <select value={form[s.key].role}
                  onChange={e => setForm(f => ({ ...f, [s.key]: { ...f[s.key], role: e.target.value as RoleKey } }))}
                  className="w-full text-[13px] font-semibold px-3 py-2.5 rounded-xl appearance-none" style={fieldStyle}>
                  {(Object.keys(s.roles) as RoleKey[]).map(r => (
                    <option key={r} value={r}>{t(`code.type.${r}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.descLabel")}</label>
                <input value={form[s.key].desc} placeholder={s.descPlaceholder}
                  onChange={e => setForm(f => ({ ...f, [s.key]: { ...f[s.key], desc: e.target.value } }))}
                  className="w-full text-[13px] px-3 py-2.5 rounded-xl" style={fieldStyle} />
              </div>
              {/* per-code note, like the hospital UI's Note column — but OURS:
                  saved with the working code list, never sent to the hospital */}
              <div>
                <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.noteLabel")}</label>
                <input value={form[s.key].note} placeholder={t("code.notePlaceholder")}
                  onChange={e => setForm(f => ({ ...f, [s.key]: { ...f[s.key], note: e.target.value } }))}
                  className="w-full text-[13px] px-3 py-2.5 rounded-xl" style={fieldStyle} />
              </div>
              {/* ICD-9 = procedure → it has an operation type (the hospital
                  UI's "Type" dropdown) and happened over a time window */}
              {s.key === "icd9" && (
                <div>
                  <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.opType")}</label>
                  <select value={form.icd9.opType}
                    onChange={e => setForm(f => ({ ...f, icd9: { ...f.icd9, opType: e.target.value } }))}
                    className="w-full text-[13px] font-semibold px-3 py-2.5 rounded-xl appearance-none" style={fieldStyle}>
                    {OPERATION_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              )}
              {s.key === "icd9" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.opStart")}</label>
                    <input type="datetime-local" value={toInputValue(form.icd9.start)}
                      onChange={e => setForm(f => ({ ...f, icd9: { ...f.icd9, start: fromInputValue(e.target.value) ?? "" } }))}
                      className="w-full text-[12px] px-2 py-2.5 rounded-xl" style={fieldStyle} />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.opEnd")}</label>
                    <input type="datetime-local" value={toInputValue(form.icd9.end)}
                      onChange={e => setForm(f => ({ ...f, icd9: { ...f.icd9, end: fromInputValue(e.target.value) ?? "" } }))}
                      className="w-full text-[12px] px-2 py-2.5 rounded-xl" style={fieldStyle} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="text-[12px] font-semibold px-4 py-2 rounded-lg hover:opacity-80 transition-all"
            style={{ border: gl.border, color: gl.text, background: gl.inputBg }}>
            {t("confirm.cancel")}
          </button>
          <button onClick={submit} disabled={ready.length === 0}
            className="flex items-center gap-1.5 text-[12px] font-bold px-4 py-2 rounded-lg hover:opacity-90 transition-all disabled:opacity-40"
            style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}>
            <Plus size={12} /> {ready.length > 1 ? t("code.addBoth") : t("confirm.addCode")}
          </button>
        </div>
      </div>
    </div>
  );
}
