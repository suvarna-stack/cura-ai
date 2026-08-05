// ============================================================
// SyncDialog — the header Sync button opens this instead of
// firing a full pull: the coder picks a visit-date period and
// only those cases are pulled from the hospital (POST /api/sync
// with {from,to}). Empty dates = pull everything, the old
// behavior. Same glassmorphism dialog pattern as ConfirmDialog.
// ============================================================
import { useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LanguageContext";
import { ModalShell } from "../../../components/ui/Modal";
import type { SyncWindow } from "../api/casesService";

/** Local YYYY-MM-DD for <input type="date"> (toISOString would shift the day in TH). */
function isoDay(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function SyncDialog({
  onStart,
  onClose,
}: {
  /** fires the sync (the provider owns the spinner) and the dialog closes */
  onStart: (window?: SyncWindow) => void;
  onClose: () => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const fromId = useId();
  const toId = useId();
  const [from, setFrom] = useState(isoDay()); // coders usually pull today's visits
  const [to, setTo] = useState(isoDay());

  const badRange = Boolean(from && to && from > to);

  const presets: Array<{ key: string; from: string; to: string }> = [
    { key: "sync.presetToday", from: isoDay(), to: isoDay() },
    { key: "sync.preset7d", from: isoDay(6), to: isoDay() },
    { key: "sync.presetAll", from: "", to: "" },
  ];

  const start = () => {
    if (badRange) return;
    onStart(from || to ? { from: from || undefined, to: to || undefined } : undefined);
    onClose();
  };

  const inputStyle = {
    background: gl.inputBg,
    border: gl.border,
    color: gl.text,
  } as const;

  return (
    <ModalShell onClose={onClose} ariaLabel={t("sync.dialogTitle")}
      overlayStyle={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      className="w-full max-w-sm rounded-2xl p-5"
      style={{
        background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20,
        border: `1px solid rgba(${gl.accentRgb},0.25)`, boxShadow: gl.shadow,
      }}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          style={{ background: `rgba(${gl.accentRgb},0.15)`, color: gl.accent }}>
          <RefreshCw size={18} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: gl.text }}>{t("sync.dialogTitle")}</h3>
      </div>
      <p className="text-[12px] font-normal leading-relaxed mb-3" style={{ color: gl.muted }}>
        {t("sync.dialogHint")}
      </p>

      <div className="flex items-center gap-1.5 mb-3" role="group" aria-label={t("sync.dialogTitle")}>
        {presets.map((p) => {
          const active = from === p.from && to === p.to;
          return (
            <button key={p.key} type="button"
              onClick={() => { setFrom(p.from); setTo(p.to); }}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-90"
              style={active
                ? { background: `rgba(${gl.accentRgb},0.16)`, border: `1px solid rgba(${gl.accentRgb},0.28)`, color: gl.accent }
                : { background: gl.inputBg, border: gl.border, color: gl.text }}>
              {t(p.key)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-1">
        <div>
          <label htmlFor={fromId} className="block text-[11px] font-semibold mb-1" style={{ color: gl.muted }}>
            {t("sync.from")}
          </label>
          <input id={fromId} type="date" value={from} max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full text-[12px] px-2.5 py-2 rounded-lg outline-none"
            style={inputStyle} />
        </div>
        <div>
          <label htmlFor={toId} className="block text-[11px] font-semibold mb-1" style={{ color: gl.muted }}>
            {t("sync.to")}
          </label>
          <input id={toId} type="date" value={to} min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="w-full text-[12px] px-2.5 py-2 rounded-lg outline-none"
            style={inputStyle} />
        </div>
      </div>
      <p className="text-[11px] font-semibold mb-3" role="alert"
        style={{ color: gl.danger, visibility: badRange ? "visible" : "hidden" }}>
        {t("sync.badRange")}
      </p>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose}
          className="text-[12px] font-semibold px-4 py-2 rounded-lg hover:opacity-80 transition-all"
          style={{ border: gl.border, color: gl.text, background: gl.inputBg }}>
          {t("confirm.cancel")}
        </button>
        <button type="button" onClick={start} disabled={badRange}
          className="flex items-center gap-1.5 text-[12px] font-bold px-4 py-2 rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
          style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}>
          <RefreshCw size={12} /> {t("sync.start")}
        </button>
      </div>
    </ModalShell>
  );
}
