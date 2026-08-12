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
//
// Review is selection-first (2026-08-07): every code carries a
// checkbox and NOTHING arrives ticked, so approving a case is an
// act of picking codes rather than deleting the ones the AI got
// wrong. Ticked cards are filled + ringed in the accent colour,
// unticked ones recede; the column header carries the standard
// tri-state "select all" (indeterminate = "mixed" to a screen
// reader) that the case list already uses for cases.
// ============================================================
import { useState } from "react";
import { Edit3, Trash2, GripVertical, AlertCircle, Plus, Sparkles, Clock, StickyNote } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { CodeCardsSkeleton, SkeletonBar } from "../global/DetailSkeletons";
import type { StoredCode } from "../../utils/caseLocal";
import { isPickable, isPicked } from "../../utils/codeSelection";
import { ORIGIN_ORDER, originOf, isAiSuggested, avgAiConfidence } from "../../utils/codeOrigin";
import type { CodeOrigin } from "../../utils/codeOrigin";
import { formatWindow } from "../../utils/operationTime";

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
  /** tick / untick one code by its index in the FULL array (selection-first
   *  review). Passing it is what turns the checkboxes on — the read-only
   *  finished-case view leaves it out and renders exactly as before. */
  onToggle?: (index: number) => void;
  /** tick / untick every pickable code in THIS column at once */
  onToggleAll?: (indices: number[], next: boolean) => void;
  loading?: boolean;
}

export function CodesColumn({ system, codes, onReorder, onEdit, onDelete, onAdd,
                             onToggle, onToggleAll, loading }: CodesColumnProps) {
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
  const filtered = codes
    .map((entry, index) => ({ entry, index }))
    .filter((r) => (system === "icd9") === isIcd9(r.entry.type));
  // Codes group by ORIGIN (2026-08-07): manual → hospital → AI → gaps, each
  // under its own header, because "the coder typed this", "the hospital
  // already had this" and "a model guessed this" carry completely different
  // authority and a coder must not have to infer which is which.
  // Reordering writes the DISPLAY order back into the array (applyReorder),
  // so a drag across a group line snaps back — grouping wins over free
  // ordering. Safe for approve: manual and hospital codes carry role-bearing
  // labels, so putting them first never steals the positional
  // principal-diagnosis pick from a bare-labeled AI row unless the coder
  // explicitly added a Primary Diagnosis.
  const groups = ORIGIN_ORDER
    .map((origin) => ({ origin, items: filtered.filter((r) => originOf(r.entry) === origin) }))
    .filter((g) => g.items.length > 0);
  const rows = groups.flatMap((g) => g.items);
  // column position of each group's first card, so its header renders once
  const groupAt = new Map<number, { origin: CodeOrigin; count: number }>();
  let groupPos = 0;
  for (const g of groups) {
    groupAt.set(groupPos, { origin: g.origin, count: g.items.length });
    groupPos += g.items.length;
  }
  // selection state of this column (positions are full-array indices, so the
  // parent can flip them without knowing how the column is filtered)
  const selectable = !!onToggle;
  const pickableIdx = rows.filter((r) => isPickable(r.entry)).map((r) => r.index);
  const pickedIdx = rows.filter((r) => isPicked(r.entry)).map((r) => r.index);
  const allPicked = pickableIdx.length > 0 && pickedIdx.length === pickableIdx.length;
  const somePicked = pickedIdx.length > 0 && !allPicked;
  // the header % describes the AI ONLY — hospital codes are facts carrying a
  // stamped 100, and averaging those in made the number meaningless
  const avg = avgAiConfidence(rows.map((r) => r.entry));

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

  /** which string names each origin group, in ORIGIN_ORDER */
  const GROUP_LABEL: Record<CodeOrigin, string> = {
    manual: "code.groupManual",
    hospital: "code.groupHospital",
    ai: "code.groupAi",
    gap: "code.groupGap",
  };

  /** header above each origin group — always drawn, even when a column holds
   *  only one group, because "these came from the hospital" is exactly the
   *  fact the coder needs and silence doesn't say it */
  const groupHeader = (origin: CodeOrigin, count: number, first: boolean) => (
    <div className={`flex items-center gap-2 px-1 pb-1 ${first ? "" : "pt-2.5"}`}>
      <p className="text-[12px] font-bold uppercase tracking-wide"
        style={{ color: origin === "manual" || origin === "hospital" ? gl.accent : gl.muted, opacity: 0.9 }}>
        {t(GROUP_LABEL[origin])}
      </p>
      <span className="text-[12px] font-bold" style={{ color: gl.muted, opacity: 0.7 }}>{count}</span>
      <span className="flex-1 h-px" style={{ background: `rgba(${gl.accentRgb},0.18)` }} />
    </div>
  );

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
    const picked = isPicked(entry);
    const pickable = isPickable(entry);
    const boxId = `pick-${system}-${index}`;
    // lines 2-5 hang under the card's text column, clear of the tick box + grip
    const indentRem = (selectable ? 1.875 : 0) + (sortable ? 1.85 : 0);
    const indent = indentRem ? `${indentRem}rem` : 0;
    return (
      // mouse-only drag-to-reorder is an enhancement; the card's buttons stay
      // the accessible path (keyboard reordering is a tracked follow-up)
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
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
          // gl.row/gl.border are white-on-white here (the card sits on gl.card),
          // so code cards get a solider fill + accent-tinted border to separate
          // from the panel behind them. In selection mode the accent fill means
          // ONE thing — "ticked for approval" — and origin (coder-added vs AI)
          // is carried by the group headers instead; read-only columns keep the
          // original origin tint.
          background: entry.missing
            ? `rgba(${gl.accentRgb},0.06)`
            : selectable
              ? picked
                ? `rgba(${gl.accentRgb},${gl.isDark ? 0.18 : 0.11})`
                : gl.isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.72)"
              : originOf(entry) === "manual"
                ? `rgba(${gl.accentRgb},${gl.isDark ? 0.16 : 0.10})`
                : gl.isDark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.85)",
          border: `1px solid rgba(${gl.accentRgb},${
            entry.missing ? 0.20
              : selectable ? (picked ? 0.55 : gl.isDark ? 0.22 : 0.18)
              : originOf(entry) === "manual" ? 0.45 : gl.isDark ? 0.35 : 0.30})`,
          // a ticked card gets an accent ring (drawn as a shadow so ticking
          // never reflows the list by a pixel) — state is never colour alone,
          // the checkbox carries it too
          boxShadow: selectable && picked
            ? `0 0 0 1px rgba(${gl.accentRgb},0.55), 0 2px 10px rgba(${gl.accentRgb},0.18)`
            : gl.shadowSm,
          opacity: dragPos === pos ? 0.35                 // ghost of the card in flight
            : selectable && pickable && !picked ? 0.78    // unticked codes recede
            : 1,
        }}>
        {/* line 1 — the tick box, the diagnosis, plus the row's controls */}
        <div className="flex items-start gap-1.5">
          {/* the pick (2026-08-07). A "???" placeholder can't be approved, so
              its box is disabled until the coder fills the code in. */}
          {selectable && (
            <span className="w-6 h-6 flex items-center justify-center shrink-0">
              <input type="checkbox" id={boxId} checked={picked} disabled={!pickable}
                onChange={() => onToggle?.(index)}
                aria-label={t("code.pick", { code: entry.code })}
                title={pickable ? t("code.pick", { code: entry.code }) : t("code.pickBlocked")}
                className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                style={{ accentColor: gl.accent }} />
            </span>
          )}
          {/* priority handle (item 12): position in the column IS the priority —
              drag starts here only, so card text stays selectable */}
          {sortable && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- mouse drag handle, see above
            <div onMouseDown={() => setArmedPos(pos)}
              title={t("code.drag")}
              className="w-6 self-stretch flex items-center justify-center shrink-0 rounded-md cursor-grab active:cursor-grabbing transition-all opacity-50 group-hover:opacity-100"
              style={{ background: `rgba(${gl.accentRgb},0.10)`, color: gl.accent }}>
              <GripVertical size={14} strokeWidth={2.25} />
            </div>
          )}
          {/* the diagnosis doubles as the tick box's label, so the whole title
              is a click/tap target for picking the code (not just the 16px box) */}
          {selectable && pickable ? (
            <label htmlFor={boxId} title={diagnosis}
              className="flex-1 min-w-0 text-[13px] font-bold leading-snug truncate cursor-pointer py-0.5"
              style={{ color: picked ? gl.text : gl.muted }}>
              {diagnosis}
            </label>
          ) : (
            <p className="flex-1 min-w-0 text-[13px] font-bold leading-snug truncate"
              style={{ color: entry.missing ? gl.muted : gl.text }} title={diagnosis}>
              {diagnosis}
            </p>
          )}
          <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button onClick={() => onEdit(index)} title={t("code.edit")}
                aria-label={`${t("code.edit")} ${entry.code}`}
                className="w-6 h-6 flex items-center justify-center rounded-md transition-all hover:scale-110"
                style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent }}>
                <Edit3 size={10} />
              </button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(index)} title={t("confirm.deleteCode")}
                aria-label={`${t("confirm.deleteCode")} ${entry.code}`}
                className="w-6 h-6 flex items-center justify-center rounded-md transition-all hover:scale-110"
                style={{ background: "rgba(239,68,68,0.10)", color: "#ef4444" }}>
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>
        {/* line 2 — the code itself, with its badges on one line */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap" style={{ paddingLeft: indent }}>
          <span className="text-[13px] font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: `rgba(${gl.accentRgb},0.14)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.25)` }}>
            {entry.code}
          </span>
          {/* the % is a MODEL score, so only AI rows carry one. A hospital
              code is already in the hospital's record — there is nothing to
              be confident about — and a hand-typed code is the coder's own
              call (2026-08-07). */}
          {isAiSuggested(entry) && (
            <span className="text-[12px] font-bold" style={{ color: gl.muted }}>{entry.confidence}%</span>
          )}
          {/* no per-card origin badge — the group header carries origin */}
          {/* the hospital's operation type ("OR Procedure" …) as a chip, like
              the Type column on its own coder UI's operation grid */}
          {system === "icd9" && entry.operation_type && (
            <span className="text-[12px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
              style={{ background: `rgba(${gl.accentRgb},0.08)`, color: gl.muted, border: `1px solid rgba(${gl.accentRgb},0.20)` }}>
              {entry.operation_type}
            </span>
          )}
        </div>
        {/* line 3 — the operation window (ICD-9 = procedure = has times) */}
        {system === "icd9" && formatWindow(entry.operation_start, entry.operation_end) && (
          <p className="text-[12px] font-semibold mt-1 flex items-center gap-1"
            style={{ color: gl.muted, paddingLeft: indent }}>
            <Clock size={9} style={{ color: gl.accent, flexShrink: 0 }} />
            {formatWindow(entry.operation_start, entry.operation_end)}
          </p>
        )}
        {/* line 4 — the code description / role */}
        {description && (
          <p className="text-[12px] font-normal leading-relaxed mt-0.5"
            style={{ color: gl.muted, paddingLeft: indent }}>
            {description}
          </p>
        )}
        {/* line 5 — the coder's internal note (never sent to the hospital) */}
        {entry.note && (
          <p className="text-[12px] font-normal italic mt-0.5 flex items-start gap-1"
            style={{ color: gl.muted, paddingLeft: indent }}>
            <StickyNote size={9} style={{ color: gl.accent, flexShrink: 0, marginTop: "2px" }} />
            {entry.note}
          </p>
        )}
        {entry.missing && entry.missingMsg && (
          <p className="text-[12px] font-semibold mt-1 flex items-center gap-1" style={{ color: gl.accent, opacity: 0.65 }}>
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
          {/* the badge counts what will actually be approved once selection is on */}
          <span className="text-[12px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: `rgba(${gl.accentRgb},${selectable && pickedIdx.length === 0 ? 0.06 : 0.12})`,
              color: selectable && pickedIdx.length === 0 ? gl.muted : gl.accent,
            }}>
            {selectable ? `${pickedIdx.length}/${rows.length}` : rows.length}
          </span>
        </div>
        <p className="text-[12px] font-normal mt-0.5" style={{ color: gl.muted }}>
          {loading
            ? <SkeletonBar className="h-2.5 w-24" />
            : rows.length === 0
              ? t("code.colSummaryEmpty")
              : avg !== null
                // avg is the AI's own average; a column of hospital codes has
                // no AI opinion in it and says so by omitting the number
                ? t("code.colSummary", { n: rows.length, avg })
                : t("code.colSummaryNoAi", { n: rows.length })}
        </p>
        {/* tri-state select-all — the same control the case list uses, so the
            two selection surfaces of the app behave identically. Hidden when
            there is nothing to tick ("Select all (0)" invites a no-op). */}
        {selectable && !loading && pickableIdx.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <label className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg cursor-pointer hover:opacity-90 transition-all"
              style={{
                background: pickedIdx.length ? `rgba(${gl.accentRgb},0.10)` : gl.inputBg,
                border: `1px solid rgba(${gl.accentRgb},${pickedIdx.length ? 0.35 : 0.18})`,
              }}>
              <input type="checkbox" checked={allPicked}
                ref={(el) => { if (el) el.indeterminate = somePicked; }}
                onChange={() => onToggleAll?.(pickableIdx, !allPicked)}
                className="w-3.5 h-3.5 rounded cursor-pointer" style={{ accentColor: gl.accent }} />
              <span className="text-[12px] font-bold"
                style={{ color: pickedIdx.length ? gl.accent : gl.muted }}>
                {pickedIdx.length
                  ? t("code.pickCount", { n: pickedIdx.length, total: pickableIdx.length })
                  : t("code.pickAll", { n: pickableIdx.length })}
              </span>
            </label>
            {pickedIdx.length > 0 && (
              <button onClick={() => onToggleAll?.(pickableIdx, false)}
                className="text-[12px] font-semibold px-2 py-1.5 rounded-lg hover:opacity-80 transition-all"
                style={{ color: gl.muted }}>
                {t("sel.clear")}
              </button>
            )}
          </div>
        )}
        {/* nothing ticked yet — say what the coder is expected to do */}
        {selectable && !loading && pickableIdx.length > 0 && pickedIdx.length === 0 && (
          <p className="text-[12px] font-normal mt-1.5" style={{ color: gl.muted, opacity: 0.85 }}>
            {t("code.pickHint")}
          </p>
        )}
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
          <p className="text-[12px] px-1 py-2" style={{ color: gl.muted, opacity: 0.8 }}>
            {t("code.emptyBox", { system: LABEL[system] })}
          </p>
        ) : (
          <>
            {rows.map((r, pos) => {
              const head = groupAt.get(pos);
              return (
                <div key={r.index}>
                  {/* origin group header — manual / hospital / AI / gaps */}
                  {head && groupHeader(head.origin, head.count, pos === 0)}
                  {dragPos !== null && insertAt === pos && dropIndicator}
                  {card(r, pos)}
                </div>
              );
            })}
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
