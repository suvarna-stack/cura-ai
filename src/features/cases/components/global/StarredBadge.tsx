import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { useCoderIdentity } from "../../hooks/useCoderIdentity";
import { mayManageStar } from "../../hooks/useCaseStars";
import { setCaseStar } from "../../api/casesService";
import { formatDateTime } from "../../utils/formatDate";
import type { ApiCaseDetail } from "../../types/api.types";

/** The star as the case's own page sees it. */
export interface StarInfo {
  starred?: boolean;
  starredBy?: string | null;
  /** the account that owns it — only that coder may take it down */
  starredByStamp?: string | null;
  starredAt?: string | null;
}

/**
 * The shared star, spelled out — and set — on the case's own page.
 *
 * On the dashboard the star is a control a coder clicks while scanning. Inside
 * the case there is nothing left to scan, so the same flag becomes a sentence:
 * WHO wants this case looked at first, and WHEN they said so. That is the
 * point of a star owned by the case rather than by a private favourites list,
 * and it is the part a list row has no room for.
 *
 * It is also clickable here (hospital request 2026-08-25). The coder who
 * decides a case matters usually decides it while reading the case, and
 * sending her back to the dashboard to say so was the one place the star could
 * not be set. Unstarred, it draws as a quiet "Mark important" button rather
 * than nothing at all.
 *
 * Ownership: everyone SEES the star — that is the whole feature — but only the
 * coder who left it may clear it, so a colleague's star renders as the plain
 * read-only sentence it always was. CaseStarService enforces the same rule;
 * this only makes the refusal visible before the click.
 *
 * Source precedence: the DETAIL payload wins over the card the coder arrived
 * with. A card only exists when they came from the list — on a deep link or a
 * reload the router state is gone — and it is also the older of the two, since
 * the dashboard payload is cached until the next approve/reopen.
 */
export function StarredBadge({ caseId, detail, fallback }: {
  /** the case being viewed — what a click stars */
  caseId: string;
  /** GET /api/cases/{id}; null while loading or after a failed fetch */
  detail: ApiCaseDetail | null;
  /** the row the coder clicked, when they came from the list */
  fallback?: StarInfo | null;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const me = useCoderIdentity();

  // `starred` absent (the static JSON export predates it) is not "unstarred" —
  // fall back to the card rather than hiding a star the coder just set
  const src: StarInfo | null =
    detail && detail.starred !== undefined ? detail : fallback ?? null;

  // What THIS browser has clicked since the payload arrived. The payloads stay
  // the source of truth for everything else, exactly as on the dashboard: a
  // detail refetch to redraw one glyph would cost the whole page.
  const [override, setOverride] = useState<StarInfo | null>(null);
  const [busy, setBusy] = useState(false);
  // a new case retires the old override. Deliberately NOT keyed on the payload
  // as well: the detail fetch starts on mount, so a star clicked while it was
  // still in flight would be wiped by a payload that predates the click.
  useEffect(() => setOverride(null), [caseId]);

  const view = override ?? src;
  const starred = view?.starred ?? false;
  const mine = mayManageStar(view?.starredByStamp, me.userId);

  const toggle = () => {
    if (!mine || busy) return;
    const next = !starred;
    setBusy(true);
    setOverride({
      starred: next,
      starredBy: next ? me.userName : null,
      starredByStamp: next ? me.userId : null,
      // the server writes the real timestamp; until it answers, say nothing
      // rather than print a time this browser invented
      starredAt: null,
    });
    void setCaseStar(caseId, next).then((s) => {
      setBusy(false);
      // a failed write drops the override, snapping back to the payload
      setOverride(s ? { ...s } : null);
    });
  };

  const at = view?.starredAt ? formatDateTime(view.starredAt) : null;
  const label = starred
    ? (view?.starredBy ? t("star.badgeBy", { name: view.starredBy }) : t("star.badge"))
    : t("star.mark");

  // The warning tone the row's star already uses, so this reads as that flag
  // followed into the case, not as a new kind of status. Unstarred it is a
  // muted outline: an invitation, not an alarm.
  const style = starred
    ? { background: `${gl.warning}1F`, color: gl.warning, border: `1px solid ${gl.warning}59` }
    : { background: "transparent", color: gl.muted, border: gl.border };

  // someone else's star: the sentence it has always been, with no click on it
  if (!mine) {
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full"
        title={t("star.byLocked", { name: view?.starredBy ?? "" })} style={style}>
        <Star size={12} fill={gl.warning} />
        {at ? `${label} · ${at}` : label}
      </span>
    );
  }

  return (
    <button type="button" onClick={toggle} disabled={busy}
      aria-pressed={starred}
      title={starred ? t("star.unmark") : t("star.mark")}
      className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full transition-all hover:opacity-80"
      style={{ ...style, opacity: busy ? 0.6 : 1 }}>
      <Star size={12} fill={starred ? gl.warning : "none"} />
      {starred && at ? `${label} · ${at}` : label}
    </button>
  );
}
