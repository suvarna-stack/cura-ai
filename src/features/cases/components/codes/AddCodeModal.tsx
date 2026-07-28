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

// canonical stored values — the dropdown shows the translated labels.
// The code system is part of the type so CodesPanel can file the card in
// the right box and writeback.py can derive the role.
export const CODE_TYPE_PRIMARY = "ICD-9 Primary Diagnosis";
export const CODE_TYPE_COMORBIDITY = "Comorbidities";
export const CODE_TYPE_ICD10_PRIMARY = "ICD-10 Primary Diagnosis";
export const CODE_TYPE_ICD10_COMORBIDITY = "ICD-10 Comorbidity";

type SystemKey = "icd10" | "icd9";

const SYSTEMS: { key: SystemKey; label: string; placeholder: string; descPlaceholder: string;
                 primary: string; comorbidity: string; catalog: "ICD-10" | "ICD-9" }[] = [
  { key: "icd10", label: "ICD-10", placeholder: "Search ICD-10…", descPlaceholder: "Acute myocardial infarction",
    primary: CODE_TYPE_ICD10_PRIMARY, comorbidity: CODE_TYPE_ICD10_COMORBIDITY, catalog: "ICD-10" },
  { key: "icd9",  label: "ICD-9",  placeholder: "Search ICD-9…", descPlaceholder: "Atrial fibrillation",
    primary: CODE_TYPE_PRIMARY, comorbidity: CODE_TYPE_COMORBIDITY, catalog: "ICD-9" },
];

export function AddCodeModal({
  onAdd, onClose, only,
}: {
  onAdd: (entry: { code: string; type: string; desc: string }) => void;
  onClose: () => void;
  /** opened from one box's "+": show only that code system */
  only?: SystemKey;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  // one independent draft per box; the coder fills the one they need
  const [form, setForm] = useState<Record<SystemKey, { code: string; desc: string; role: "primary" | "comorbidity" }>>({
    icd10: { code: "", desc: "", role: "primary" },
    icd9:  { code: "", desc: "", role: "primary" },
  });
  const boxes = only ? SYSTEMS.filter((s) => s.key === only) : SYSTEMS;
  const filled = (k: SystemKey) => form[k].code.trim() !== "" && form[k].desc.trim() !== "";
  const ready = boxes.filter((s) => filled(s.key));

  const fieldStyle: React.CSSProperties = {
    background: gl.inputBg, border: `1px solid rgba(${gl.accentRgb},0.30)`, color: gl.text, outline: "none",
  };

  const submit = () => {
    // both boxes may be filled — each becomes its own code
    for (const s of ready) {
      const f = form[s.key];
      onAdd({ code: f.code.trim(), type: f.role === "primary" ? s.primary : s.comorbidity, desc: f.desc.trim() });
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
                  onChange={e => setForm(f => ({ ...f, [s.key]: { ...f[s.key], role: e.target.value as "primary" | "comorbidity" } }))}
                  className="w-full text-[13px] font-semibold px-3 py-2.5 rounded-xl appearance-none" style={fieldStyle}>
                  <option value="primary">{t("code.type.primary")}</option>
                  <option value="comorbidity">{t("code.type.comorbidity")}</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>{t("code.descLabel")}</label>
                <input value={form[s.key].desc} placeholder={s.descPlaceholder}
                  onChange={e => setForm(f => ({ ...f, [s.key]: { ...f[s.key], desc: e.target.value } }))}
                  className="w-full text-[13px] px-3 py-2.5 rounded-xl" style={fieldStyle} />
              </div>
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
