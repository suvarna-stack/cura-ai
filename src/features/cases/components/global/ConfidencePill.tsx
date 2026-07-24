import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";

export function ConfidencePill({ value }: { value: number }) {
  const { gl } = useTheme();
  const { t } = useLang();
  return (
    // px-2 py-0.5 gives a proper oval pill — not too wide, not circular
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center justify-center whitespace-nowrap"
      title={t("confidence.tooltip")}
      style={{
        background: `rgba(${gl.accentRgb},0.18)`,
        color: gl.accent,
        border: `1px solid rgba(${gl.accentRgb},0.28)`,
        minWidth: "2.5rem",
        textAlign: "center",
      }}
    >
      {t("confidence.label", { n: value })}
    </span>
  );
}
