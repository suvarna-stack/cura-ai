import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";

// Compact window of page numbers with "…" gaps: always show first, last, and
// the current page ±1. Keeps the bar short even at 78 pages.
function pageWindow(current: number, pages: number): (number | "…")[] {
  const keep: number[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= current - 1 && i <= current + 1)) keep.push(i);
  }
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const i of keep) {
    if (prev) {
      if (i - prev === 2) out.push(prev + 1);   // single gap → show the number
      else if (i - prev > 2) out.push("…");     // wider gap → ellipsis
    }
    out.push(i);
    prev = i;
  }
  return out;
}

export function Pagination({ current, total, perPage, onPage, onPrev, onNext }: {
  current: number;
  total: number;
  perPage: number;
  // preferred: jump straight to any page. onPrev/onNext kept for callers that
  // haven't been migrated (they fall back to the simple Prev/Next-only bar).
  onPage?: (n: number) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const pages = Math.max(1, Math.ceil(total / perPage));
  const [jump, setJump] = useState("");

  const go = (n: number) => onPage?.(Math.min(pages, Math.max(1, n)));
  const submitJump = () => {
    const n = parseInt(jump, 10);
    if (!Number.isNaN(n)) go(n);
    setJump("");
  };

  const btn: React.CSSProperties = {
    background: gl.row, backdropFilter: gl.blur16, WebkitBackdropFilter: gl.blur16,
    border: gl.borderSm, color: gl.muted,
  };
  const activeBtn: React.CSSProperties = {
    background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff",
  };

  const goPrev = onPage ? () => go(current - 1) : onPrev;
  const goNext = onPage ? () => go(current + 1) : onNext;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-3 pb-1">
      <button onClick={goPrev} disabled={current <= 1}
        className="text-[12px] font-medium px-3 py-1 rounded-lg hover:opacity-80 transition-all disabled:opacity-40"
        style={btn}>
        {t("page.prev")}
      </button>

      {onPage ? (
        // numbered buttons — a direct jump to any page
        pageWindow(current, pages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="text-[12px] font-medium px-1 select-none" style={{ color: gl.muted }}>…</span>
          ) : (
            <button key={p} onClick={() => go(p)}
              className="text-[12px] font-bold px-2.5 py-1 rounded-lg hover:opacity-80 transition-all"
              style={{ minWidth: "1.9rem", ...(p === current ? activeBtn : btn) }}>
              {p}
            </button>
          )
        )
      ) : (
        // legacy callers (no onPage): keep the single current/total pill
        <span className="text-[12px] font-bold px-3 py-1 rounded-lg"
          style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}>
          {current} / {pages}
        </span>
      )}

      <button onClick={goNext} disabled={current >= pages}
        className="text-[12px] font-medium px-3 py-1 rounded-lg hover:opacity-80 transition-all disabled:opacity-40"
        style={btn}>
        {t("page.next")}
      </button>

      {/* jump-to-page — only worth showing once there are enough pages to matter */}
      {onPage && pages > 5 && (
        <div className="flex items-center gap-1 ml-1.5">
          <span className="text-[12px] font-medium" style={{ color: gl.muted }}>{t("page.goto")}</span>
          <input
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") submitJump(); }}
            placeholder={`${current}`}
            aria-label={t("page.goto")}
            className="text-[12px] font-semibold w-11 px-2 py-1 rounded-lg outline-none text-center"
            style={{ background: gl.inputBg, border: gl.border, color: gl.text }} />
          <button onClick={submitJump}
            className="text-[12px] font-bold px-2.5 py-1 rounded-lg hover:opacity-80 transition-all"
            style={{ border: `1px solid rgba(${gl.accentRgb},0.30)`, color: gl.accent, background: `rgba(${gl.accentRgb},0.08)` }}>
            {t("page.go")}
          </button>
        </div>
      )}
    </div>
  );
}
