// ============================================================
// One code-system column of a detail page.
//
// The detail pages are three containers side by side — Report |
// ICD-10 | ICD-9 — so each code system is its own full-height
// panel with its own header, scrolling list and "+" at the foot
// (meeting item 10 + the hospital sketch). Nothing interleaves.
// Meeting item 12: every code carries a priority, so each card has a
// drag handle that moves it inside its column (the array order IS
// the priority — the first ICD-10 is exported as principal diagnosis).
// Hand-rolled HTML5 drag-and-drop, no library (repo convention) —
// replaced the original up/down arrows at the hospital's request
// (21/07/2026): dragging reads as "priority list" at a glance.
// ============================================================
import { useState } from "react";
import { Edit3, Trash2, GripVertical, AlertCircle, Plus, Sparkles } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { CodeCardsSkeleton, SkeletonBar } from "../global/DetailSkeletons";
import type { StoredCode } from "../../utils/caseLocal";

/** Which column a code belongs in. Procedure systems (ICD-9, *-PCS) are ICD-9;
 *  everything else (ICD-10, DRG, legacy "Comorbidities") is ICD-10. */
const isIcd9 = (type: string) => /icd[- ]?9|pcs/i.test(type);

export type CodeSystem = "icd9" | "icd10";
const LABEL: Record<CodeSystem, string> = { icd9: "ICD-9", icd10: "ICD-10" };

export interface CodesColumnProps {
  system: CodeSystem;
  /** the FULL code list — the column filters it and edits by real index */
  codes: StoredCode[];
  /** called with the full reordered array when a card is dropped */
  onReorder?: (next: StoredCode[]) => void;
  onEdit?: (index: number) => void;
  onDelete?: (index: number) => void;
  onAdd?: (system: CodeSystem) => void;
  loading?: boolean;
}

export function CodesColumn({ system, codes, onReorder, onEdit, onDelete, onAdd, loading }: CodesColumnProps) {
  const { gl } = useTheme();
  const { t } = useLang();

  // drag state, all in column positions: which card is in flight, which card
  // is "armed" (drag may only start from the grip handle — otherwise selecting
  // text in a card would drag it), and where the drop would insert
  const [dragPos, setDragPos] = useState<number | null>(null);
  const [armedPos, setArmedPos] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);

  // keep the original positions: the columns are two views of ONE array, and
  // the priority lives in that array
  const rows = codes
    .map((entry, index) => ({ entry, index }))
    .filter((r) => (system === "icd9") === isIcd9(r.entry.type));
  const scored = rows.filter((r) => !r.entry.missing);
  const avg = scored.length
    ? Math.round(scored.reduce((s, r) => s + r.entry.confidence, 0) / scored.length)
    : null;

  /** Meeting item 12: drop a code at a new position to change its priority.
   *  `from`/`to` are positions within THIS column, so a code keeps its system —
   *  reordering can never reclassify a code. The column's entries are placed
   *  back into the SAME slots of the shared array in their new order, leaving
   *  the other system's codes untouched. */
  const applyReorder = (from: number, to: number) => {
    if (!onReorder || from === to) return;
    const slots = rows.map((r) => r.index);       // this column's full-array slots
    const entries = rows.map((r) => r.entry);
    const [moved] = entries.splice(from, 1);
    entries.splice(to, 0, moved);
    const next = [...codes];
    slots.forEach((slot, i) => { next[slot] = entries[i]; });
    onReorder(next);
  };

  const endDrag = () => { setDragPos(null); setArmedPos(null); setInsertAt(null); };

  const handleDrop = () => {
    if (dragPos !== null && insertAt !== null) {
      // removing the card first shifts everything after it up by one
      applyReorder(dragPos, insertAt > dragPos ? insertAt - 1 : insertAt);
    }
    endDrag();
  };

  /** a thin accent bar marking where the drop would land */
  const dropIndicator = (
    <div className="h-[3px] rounded-full mx-1 my-0.5 transition-all"
      style={{ background: gl.accent, boxShadow: `0 0 6px rgba(${gl.accentRgb},0.6)` }} />
  );

  const card = ({ entry, index }: { entry: StoredCode; index: number }, pos: number) => {
    // item 10's reading order. `desc` is "<diagnosis> · <role>" for imported
    // codes; anything without the separator is the diagnosis itself.
    const [name, ...rest] = (entry.desc ?? "").split(" · ");
    const diagnosis = name?.trim() || entry.code;
    const description = rest.join(" · ").trim();
    const sortable = !!onReorder;
    return (
      <div key={index}
        draggable={sortable && armedPos === pos}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", entry.code); // Firefox needs data to drag
          setDragPos(pos);
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (dragPos === null) return;
          e.preventDefault();                    // allow dropping here
          e.dataTransfer.dropEffect = "move";
          // top half inserts before this card, bottom half after it
          const r = e.currentTarget.getBoundingClientRect();
          setInsertAt(e.clientY < r.top + r.height / 2 ? pos : pos + 1);
        }}
        onDrop={(e) => { e.preventDefault(); handleDrop(); }}
        onMouseUp={() => setArmedPos(null)}      // grip released without dragging
        className="group rounded-lg px-2.5 py-2 transition-all"
        style={{
          background: entry.missing ? `rgba(${gl.accentRgb},0.06)` : gl.row,
          border: entry.missing ? `1px solid rgba(${gl.accentRgb},0.20)` : gl.border,
          opacity: dragPos === pos ? 0.35 : 1,   // ghost of the card in flight
        }}>
        {/* line 1 — the diagnosis, plus the row's controls */}
        <div className="flex items-start gap-1.5">
          {/* priority handle (item 12): position in the column IS the priority —
              drag starts here only, so card text stays selectable */}
          {sortable && (
            <div onMouseDown={() => setArmedPos(pos)}
              title={t("code.drag")}
              className="w-6 self-stretch flex items-center justify-center shrink-0 rounded-md cursor-grab active:cursor-grabbing transition-all opacity-50 group-hover:opacity-100"
              style={{ background: `rgba(${gl.accentRgb},0.10)`, color: gl.accent }}>
              <GripVertical size={14} strokeWidth={2.25} />
            </div>
          )}
          <p className="flex-1 min-w-0 text-[13px] font-bold leading-snug truncate"
            style={{ color: entry.missing ? gl.muted : gl.text }} title={diagnosis}>
            {diagnosis}
          </p>
          <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button onClick={() => onEdit(index)} title={t("code.edit")}
                className="w-5 h-5 flex items-center justify-center rounded-md transition-all hover:scale-110"
                style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent }}>
                <Edit3 size={10} />
              </button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(index)} title={t("confirm.deleteCode")}
                className="w-5 h-5 flex items-center justify-center rounded-md transition-all hover:scale-110"
                style={{ background: "rgba(239,68,68,0.10)", color: "#ef4444" }}>
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>
        {/* line 2 — the code itself, with its badges on one line */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap" style={{ paddingLeft: sortable ? "1.85rem" : 0 }}>
          <span className="text-[13px] font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: `rgba(${gl.accentRgb},0.14)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.25)` }}>
            {entry.code}
          </span>
          {!entry.missing && (
            <span className="text-[10px] font-bold" style={{ color: gl.muted }}>{entry.confidence}%</span>
          )}
          {entry.manual && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `rgba(${gl.accentRgb},0.08)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.30)` }}>
              {t("code.manualBadge")}
            </span>
          )}
        </div>
        {/* line 3 — the code description / role */}
        {description && (
          <p className="text-[11px] font-normal leading-relaxed mt-0.5"
            style={{ color: gl.muted, paddingLeft: sortable ? "1.85rem" : 0 }}>
            {description}
          </p>
        )}
        {entry.missing && entry.missingMsg && (
          <p className="text-[11px] font-semibold mt-1 flex items-center gap-1" style={{ color: gl.accent, opacity: 0.65 }}>
            <AlertCircle size={9} /> {entry.missingMsg}
          </p>
        )}
      </div>
    );
  };

  const panel: React.CSSProperties = {
    background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20,
    border: gl.border, boxShadow: gl.shadow,
  };

  return (
    <div className="w-[21rem] shrink-0 flex flex-col rounded-2xl overflow-hidden" style={panel}>
      <div className="px-4 py-3.5 shrink-0" style={{ borderBottom: gl.borderSm }}>
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: gl.accent }} />
          <h2 className="text-[15px] font-bold flex-1" style={{ color: gl.text }}>{LABEL[system]}</h2>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent }}>{rows.length}</span>
        </div>
        <p className="text-[11px] font-normal mt-0.5" style={{ color: gl.muted }}>
          {loading
            ? <SkeletonBar className="h-2.5 w-24" />
            : avg !== null
              ? t("code.colSummary", { n: scored.length, avg })
              : t("code.colSummaryEmpty")}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1.5 scroll-thin"
        onDragOver={(e) => {
          if (dragPos === null) return;
          e.preventDefault();
          // over the container's own padding (below the last card) = drop at the end
          if (e.target === e.currentTarget) setInsertAt(rows.length);
        }}
        onDrop={(e) => { e.preventDefault(); handleDrop(); }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setInsertAt(null);
        }}>
        {loading ? <CodeCardsSkeleton /> : rows.length === 0 ? (
          <p className="text-[11px] px-1 py-2" style={{ color: gl.muted, opacity: 0.8 }}>
            {t("code.emptyBox", { system: LABEL[system] })}
          </p>
        ) : (
          <>
            {rows.map((r, pos) => (
              <div key={r.index}>
                {dragPos !== null && insertAt === pos && dropIndicator}
                {card(r, pos)}
              </div>
            ))}
            {dragPos !== null && insertAt === rows.length && dropIndicator}
          </>
        )}
      </div>

      {onAdd && (
        <div className="px-3 py-3 shrink-0" style={{ borderTop: gl.borderSm }}>
          <button onClick={() => onAdd(system)}
            className="w-full py-2 rounded-lg text-[12px] font-bold flex items-center justify-center gap-1.5 hover:opacity-80 transition-all"
            style={{ color: gl.accent, border: `1px dashed rgba(${gl.accentRgb},0.40)`, background: `rgba(${gl.accentRgb},0.05)` }}>
            <Plus size={12} /> {t("code.addTo", { system: LABEL[system] })}
          </button>
        </div>
      )}
    </div>
  );
}
