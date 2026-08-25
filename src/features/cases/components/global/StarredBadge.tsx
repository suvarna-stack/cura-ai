import { Star } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { formatDateTime } from "../../utils/formatDate";
import type { ApiCaseDetail } from "../../types/api.types";

/** The star as the case's own page sees it. */
export interface StarInfo {
  starred?: boolean;
  starredBy?: string | null;
  starredAt?: string | null;
}

/**
 * The shared star, spelled out on the case's own page.
 *
 * On the dashboard the star is a control — one glyph a coder clicks while
 * scanning. Inside the case there is nothing left to scan, so the same flag
 * becomes a sentence: WHO wants this case looked at first, and WHEN they said
 * so. That is the whole point of a star owned by the case rather than by a
 * private favourites list, and it is the part a list row has no room for.
 *
 * Read-only on purpose: the star is set and cleared from the list, where the
 * coder is choosing between cases. Renders nothing when the case is unstarred.
 *
 * Source precedence: the DETAIL payload wins over the card the coder arrived
 * with. A card only exists when they came from the list — on a deep link or a
 * reload the router state is gone — and it is also the older of the two, since
 * the dashboard payload is cached until the next approve/reopen.
 */
export function StarredBadge({ detail, fallback }: {
  /** GET /api/cases/{id}; null while loading or after a failed fetch */
  detail: ApiCaseDetail | null;
  /** the row the coder clicked, when they came from the list */
  fallback?: StarInfo | null;
}) {
  const { gl } = useTheme();
  const { t } = useLang();

  // `starred` absent (the static JSON export predates it) is not "unstarred" —
  // fall back to the card rather than hiding a star the coder just set
  const src: StarInfo | null =
    detail && detail.starred !== undefined ? detail : fallback ?? null;
  if (!src?.starred) return null;

  const at = src.starredAt ? formatDateTime(src.starredAt) : null;
  const label = src.starredBy
    ? t("star.badgeBy", { name: src.starredBy })
    : t("star.badge");

  return (
    <span className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full"
      // the warning tone the row's star already uses, so this reads as that
      // flag followed into the case, not as a new kind of status
      style={{ background: `${gl.warning}1F`, color: gl.warning,
               border: `1px solid ${gl.warning}59` }}>
      <Star size={12} fill={gl.warning} />
      {at ? `${label} · ${at}` : label}
    </span>
  );
}
