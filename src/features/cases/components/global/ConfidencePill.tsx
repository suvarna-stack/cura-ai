import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";

export function ConfidencePill({
  value,
  loading,
}: {
  value: number | null | undefined
  loading?: boolean
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const n = value == null || value <= 0 ? null : Math.round(value);
  return (
    // px-2 py-0.5 gives a proper oval pill — not too wide, not circular
    <span
      className={`text-[12px] font-bold px-2 py-0.5 rounded-full inline-flex items-center justify-center whitespace-nowrap ${loading ? "animate-pulse" : ""}`}
      title={t("confidence.tooltip")}
      style={{
        background: `rgba(${gl.accentRgb},0.18)`,
        color: gl.accent,
        border: `1px solid rgba(${gl.accentRgb},0.28)`,
        minWidth: "2.5rem",
        textAlign: "center",
      }}
    >
      {loading && n == null
        ? t("confidence.loading")
        : n == null
          ? t("confidence.none")
          : t("confidence.label", { n })}
    </span>
  );
}
