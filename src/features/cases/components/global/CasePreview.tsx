// ============================================================
// Case-row preview (hospital feedback item 3, extended by meeting
// item 7): fills the free space on the card with CC/PI, ALL
// diagnoses (code + description, ICD-10 and ICD-9 kept apart) and
// the orders/treatment behind the case — so a coder can judge a
// case from the list without opening it.
// ============================================================
import { Pill, FlaskConical, Scan, Scissors, ClipboardList } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import type { RichCase } from "../../hooks/useCases";

// [key, short chip label (must fit the fixed-width chip), full name, icon]
const ORDER_META: [string, string, string, typeof Pill][] = [
  ["medicine", "Med", "medication orders", Pill],
  ["lab", "Lab", "lab orders", FlaskConical],
  ["X-ray", "CT", "CT / X-ray orders", Scan],
  ["surgery", "Surg", "surgical procedures", Scissors],
  ["other", "Other", "other items", ClipboardList],
];

/** One labelled line of the preview: a fixed gutter label, then the content
 *  column. Every row shares the gutter width, so the whole block lines up. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const { gl } = useTheme();
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="w-16 shrink-0 text-[12px] font-bold uppercase tracking-wide pt-[1px]"
        style={{ color: gl.muted, opacity: 0.75 }}>{label}</span>
      <div className="flex-1 min-w-0 space-y-0.5">{children}</div>
    </div>
  );
}

const MAX_CODES = 6;

export function CasePreview({ c }: { c: RichCase }) {
  const { gl } = useTheme();
  const allCodes = c.codes ?? [];
  const icd10 = allCodes.filter((k) => k.system === "ICD-10");
  const icd9 = allCodes.filter((k) => k.system === "ICD-9");
  const orders = ORDER_META.filter(([k]) => (c.orders?.[k] ?? 0) > 0);
  if (!c.cc && !c.pi && !c.ccpi && allCodes.length === 0 && orders.length === 0) return null;

  // ---- one visual idiom for the whole block --------------------------------
  // a fixed label gutter on the left (see Row), content in a single aligned
  // column on the right. Every chip is the same width, so the descriptions form
  // one clean left edge instead of a ragged one.

  /** fixed-width chip so every line's text starts at the same x */
  const chip = (text: string, opts?: { principal?: boolean; icon?: typeof Pill; title?: string }, key?: number) => (
    <span key={key} className="w-[4.5rem] shrink-0 text-[12px] font-bold px-1 py-0.5 rounded-md truncate text-center inline-flex items-center justify-center gap-0.5"
      title={opts?.title}
      style={opts?.principal
        ? { background: `rgba(${gl.accentRgb},0.18)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.30)` }
        : { background: gl.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.045)", color: gl.muted, border: gl.borderSm }}>
      {opts?.icon && <opts.icon size={8} />}{text}
    </span>
  );

  // the row stays scannable: code chips only. Descriptions, every order name
  // and the full narrative live in the info dialog (the ⓘ button on the row).
  const codeChips = (list: typeof allCodes) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      {list.slice(0, MAX_CODES).map((k, i) =>
        chip(k.code, {
          principal: k.role === "principal_diagnosis",
          title: `${k.code} · ${k.desc ?? ""} (${k.role.replace(/_/g, " ")})`,
        }, i))}
      {list.length > MAX_CODES && (
        <span className="text-[12px] font-semibold" style={{ color: gl.muted }}>+{list.length - MAX_CODES}</span>
      )}
    </div>
  );

  return (
    <div className="mt-1 space-y-1">
      {/* the clinical narrative — same gutter as everything below it */}
      {(c.cc || c.pi) ? (
        <>
          {c.cc && <Row label="CC"><p className="text-[12px] font-normal truncate" style={{ color: gl.muted }} title={c.cc}>{c.cc}</p></Row>}
          {c.pi && <Row label="PI"><p className="text-[12px] font-normal truncate" style={{ color: gl.muted }} title={c.pi}>{c.pi}</p></Row>}
        </>
      ) : c.ccpi && (
        <Row label="CC/PI"><p className="text-[12px] font-normal truncate" style={{ color: gl.muted }} title={c.ccpi}>{c.ccpi}</p></Row>
      )}

      {/* every diagnosis — ICD-10 and ICD-9 never interleaved (item 7/10) */}
      {icd10.length > 0 && <Row label="ICD-10">{codeChips(icd10)}</Row>}
      {icd9.length > 0 && <Row label="ICD-9">{codeChips(icd9)}</Row>}

      {/* what was actually ordered: the count chip, then the order names */}
      {orders.length > 0 && (
        <Row label="Orders">
          <div className="flex items-center gap-1.5 flex-wrap">
            {orders.map(([key, label, fullName, Icon], i) =>
              chip(`${label} ${c.orders![key]}`, {
                icon: Icon,
                title: `${c.orders![key]} ${fullName}: ${(c.orderNames?.[key] ?? []).join(" · ")}`,
              }, i))}
          </div>
        </Row>
      )}
    </div>
  );
}
