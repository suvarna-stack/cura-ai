// ============================================================
// Pulsing placeholders for the case-detail pages while
// /api/cases/{id}.json loads — same visual language as the
// Dashboard's sync SkeletonRow (animate-pulse + theme-aware bar).
// ============================================================
import { useTheme } from "../../context/ThemeContext";

const barColor = (isDark: boolean) =>
  isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

/** Small inline bar, e.g. for a sub-header count line. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  const { gl } = useTheme();
  return (
    <span className={`inline-block rounded animate-pulse align-middle ${className}`}
      style={{ background: barColor(gl.isDark) }} />
  );
}

/** Mimics a few report sections: a field-name label + text lines. */
export function ReportSkeleton() {
  const { gl } = useTheme();
  const bar = barColor(gl.isDark);
  const sections = [
    { label: "w-32", lines: ["w-full", "w-5/6", "w-2/3"] },
    { label: "w-44", lines: ["w-full", "w-3/4"] },
    { label: "w-28", lines: ["w-11/12", "w-1/2"] },
  ];
  return (
    <div className="animate-pulse space-y-6">
      {sections.map((s, i) => (
        <div key={i} className="space-y-2.5">
          <div className={`h-2.5 rounded ${s.label}`} style={{ background: bar }} />
          {s.lines.map((w, j) => (
            <div key={j} className={`h-3 rounded ${w}`} style={{ background: bar }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Mimics the code cards: type chip + code + confidence pill + description. */
export function CodeCardsSkeleton({ count = 4 }: { count?: number }) {
  const { gl } = useTheme();
  const bar = barColor(gl.isDark);
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl px-3.5 py-3 animate-pulse"
          style={{ background: gl.row, border: gl.border }}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="space-y-1.5">
              <div className="h-3.5 w-12 rounded" style={{ background: bar }} />
              <div className="h-4 w-20 rounded" style={{ background: bar }} />
            </div>
            <div className="h-5 w-12 rounded-full" style={{ background: bar }} />
          </div>
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded" style={{ background: bar }} />
            <div className="h-2.5 w-3/4 rounded" style={{ background: bar }} />
          </div>
        </div>
      ))}
    </>
  );
}
