package com.medcodeai.api.service;

import com.medcodeai.api.repo.AnalyticsRepository;
import com.medcodeai.api.repo.AnalyticsRepository.Window;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the Analytics page payload out of the synced hospital data. Until
 * 2026-08-06 that page ran on hardcoded demo numbers in the frontend
 * (`USE_MOCK`); this service replaces them.
 *
 * <p>Without an explicit date range the summary block is NOT recomputed here —
 * it is lifted verbatim from the dashboard payload (via CasesCache), so the
 * stat tiles can never drift from the Dashboard's own counts. Everything else
 * is a fresh roll-up.
 *
 * <p>With a range (`from`/`to`, added 2026-08-25 for the coder's date filter)
 * every card is scoped to it, summary included — and the summary then comes
 * from SQL that mirrors the same queue routing, because the cache only knows
 * the un-filtered world. Cards about the case population are windowed on the
 * visit date; cards about what coders did are windowed on the action date.
 */
@Service
public class AnalyticsService {

    /** Days in the "Cases Over Time" window when the caller doesn't say. */
    public static final int DEFAULT_DAYS = 30;

    /** Codes in the "Top ICD Codes" card when the caller doesn't say. */
    public static final int DEFAULT_TOP_CODES = 10;

    private final AnalyticsRepository repo;
    private final CasesCache cache;
    private final CasesViewService views;
    private final com.medcodeai.api.repo.UsersRepository users;

    public AnalyticsService(AnalyticsRepository repo, CasesCache cache, CasesViewService views,
                            com.medcodeai.api.repo.UsersRepository users) {
        this.repo = repo;
        this.cache = cache;
        this.views = views;
        this.users = users;
    }

    /**
     * @param from first day of the range, or null for "no range" (the rolling
     *             `days` window, and every other card un-filtered)
     * @param to   last day of the range, inclusive; null with `from` null
     */
    public Map<String, Object> build(int days, int topCodes, LocalDate from, LocalDate to,
                                     LocalDate today) {
        boolean ranged = from != null && to != null;
        Window w = ranged ? Window.of(from, to) : Window.all();
        // The two series span the range when there is one, else the rolling
        // window ending today — so a filtered page's chart matches its tiles.
        LocalDate seriesFrom = ranged ? from : today.minusDays(days - 1L);
        LocalDate seriesTo = ranged ? to : today;
        int points = (int) ChronoUnit.DAYS.between(seriesFrom, seriesTo) + 1;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("range", range(ranged, seriesFrom, seriesTo));
        out.put("summary", summary(w, ranged));
        out.put("casesOverTime", casesOverTime(seriesFrom, seriesTo, points));
        out.put("coverageCounts", coverageCounts(w));
        out.put("topCodes", topCodes(w, topCodes));
        out.put("topPrincipalDiagnosis", topPrincipalDiagnosis(w, topCodes));
        out.put("documentationGaps", documentationGaps(w));
        out.put("codingActivity", codingActivity(seriesFrom, seriesTo, points));
        out.put("finishedByCoder", finishedByCoder(w));
        out.put("coderKpi", coderKpi(w));
        out.put("turnaround", turnaround(w));
        out.put("codingDepth", codingDepth(w));
        out.put("caseMix", caseMix(w));
        return out;
    }

    /** What the page is actually showing — echoed so the UI can label itself. */
    private static Map<String, Object> range(boolean ranged, LocalDate from, LocalDate to) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("filtered", ranged);
        out.put("from", from.toString());
        out.put("to", to.toString());
        return out;
    }

    /**
     * The four queues plus the two figures the hospital's dashboard asks for
     * by name: `notFinished` (everything not yet approved — complete +
     * incomplete + reopened) and `finishedPct`.
     *
     * <p>Un-filtered, this is the dashboard's own stats object verbatim, so the
     * tiles can never drift from the Dashboard. Filtered, the cache cannot
     * answer, so the same routing is recomputed in SQL — see
     * AnalyticsRepository.summary(). Key order is the contract either way.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> summary(Window w, boolean ranged) {
        Map<String, Object> src = ranged
                ? repo.summary(w)
                : (Map<String, Object>) cache.get(views::buildCasesPayload).get("stats");
        long total = num(src.get("total"));
        long finished = num(src.get("finished"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total);
        out.put("complete", num(src.get("complete")));
        out.put("incomplete", num(src.get("incomplete")));
        out.put("reopened", num(src.get("reopened")));
        out.put("finished", finished);
        out.put("notFinished", total - finished);
        out.put("finishedPct", pct(finished, total));
        return out;
    }

    private static long num(Object v) {
        return v == null ? 0L : ((Number) v).longValue();
    }

    /**
     * A percentage to one decimal, or null when the denominator is zero —
     * "no cases yet" must not render as a confident 0%.
     */
    private static Double pct(long part, long whole) {
        return whole == 0 ? null : Math.round(part * 1000.0 / whole) / 10.0;
    }

    /**
     * Visits per day over the last `days` days ending today, inclusive, with
     * empty days zero-filled so the line has one point per day. `iso` is a
     * local-midnight timestamp with no zone suffix: the browser must read it
     * as the hospital's calendar day, and a `Z` would shift it west of UTC.
     */
    private List<Map<String, Object>> casesOverTime(LocalDate from, LocalDate to, int days) {
        Map<LocalDate, Long> byDay = new HashMap<>();
        for (Map<String, Object> r : repo.casesPerDay(from, to)) {
            byDay.put(((java.sql.Date) r.get("day")).toLocalDate(), ((Number) r.get("n")).longValue());
        }
        List<Map<String, Object>> series = new ArrayList<>(days);
        for (int i = 0; i < days; i++) {
            LocalDate d = from.plusDays(i);
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("iso", d + "T00:00:00");
            point.put("count", byDay.getOrDefault(d, 0L));
            series.add(point);
        }
        return series;
    }

    /** Coverage families, biggest first; the blank family gets a display label. */
    private List<Map<String, Object>> coverageCounts(Window w) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : repo.coverageCounts(w)) {
            String family = (String) r.get("family");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", family == null ? "ไม่ระบุสิทธิ" : family);
            row.put("count", r.get("n"));
            out.add(row);
        }
        return out;
    }

    /**
     * What incomplete cases are missing, two ways: per missing item (one case
     * counts once per item it lacks) and per disease group (incomplete vs
     * total). Item keys are labeled with the same map the case list uses
     * (CasesViewService.missingLabels()), so "icd10" reads identically on
     * both pages; a key that map doesn't know shows raw rather than dropping.
     */
    private Map<String, Object> documentationGaps(Window w) {
        Map<String, String> labels = CasesViewService.missingLabels();
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> r : repo.missingDetailCounts(w)) {
            String key = (String) r.get("key");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("label", labels.getOrDefault(key, key));
            row.put("count", r.get("n"));
            items.add(row);
        }
        List<Map<String, Object>> byGroup = new ArrayList<>();
        for (Map<String, Object> r : repo.completenessByGroup(w)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", r.get("grp"));
            row.put("incomplete", r.get("incomplete"));
            row.put("total", r.get("total"));
            byGroup.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("byGroup", byGroup);
        return out;
    }

    /**
     * Coder actions per day over the same window as casesOverTime, zero-filled
     * the same way. Dated by the audit trail's created_at (when the action
     * actually happened), not by the visit date — this series answers "what
     * did the team do", the other answers "when did patients come".
     */
    private List<Map<String, Object>> codingActivity(LocalDate from, LocalDate to, int days) {
        Map<LocalDate, Map<String, Object>> byDay = new HashMap<>();
        for (Map<String, Object> r : repo.activityPerDay(from, to)) {
            byDay.put(((java.sql.Date) r.get("day")).toLocalDate(), r);
        }
        List<Map<String, Object>> series = new ArrayList<>(days);
        for (int i = 0; i < days; i++) {
            LocalDate d = from.plusDays(i);
            Map<String, Object> r = byDay.get(d);
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("iso", d + "T00:00:00");
            point.put("approved", r == null ? 0L : ((Number) r.get("approved")).longValue());
            point.put("coded", r == null ? 0L : ((Number) r.get("coded")).longValue());
            point.put("reopened", r == null ? 0L : ((Number) r.get("reopened")).longValue());
            series.add(point);
        }
        return series;
    }

    /**
     * Finished (approved) cases per coder, biggest first. The audit stamp is
     * an email or bare username; map it to the account's display name the
     * same way the Dashboard's finished queue does.
     */
    private List<Map<String, Object>> finishedByCoder(Window w) {
        Map<String, String> names = users.displayNameByStamp();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : repo.finishedByCoder(w)) {
            String stamp = (String) r.get("stamp");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("coder", names.getOrDefault(stamp, stamp));
            row.put("coderId", stamp);
            row.put("cases", ((Number) r.get("n")).longValue());
            out.add(row);
        }
        return out;
    }

    /**
     * Sync-to-first-approval turnaround. Minutes as whole numbers — the
     * humanizing ("2.4 h") is display work; null median/p90 with cases = 0
     * until the first approval exists.
     */
    private Map<String, Object> turnaround(Window w) {
        Map<String, Object> r = repo.turnaround(w);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("medianMinutes", roundMinutes(r.get("median_minutes")));
        out.put("p90Minutes", roundMinutes(r.get("p90_minutes")));
        out.put("cases", ((Number) r.get("n")).longValue());
        return out;
    }

    private static Long roundMinutes(Object v) {
        return v == null ? null : Math.round(((Number) v).doubleValue());
    }

    /**
     * How thoroughly cases are coded: codes-per-case distribution (buckets
     * ordered 0 → 6+, absent buckets zero-filled so the bars keep their
     * positions), the uncoded backlog, the average, and the role mix.
     */
    private Map<String, Object> codingDepth(Window w) {
        Map<String, Long> byBucket = new HashMap<>();
        for (Map<String, Object> r : repo.codesPerCaseBuckets(w)) {
            byBucket.put((String) r.get("bucket"), ((Number) r.get("cases")).longValue());
        }
        List<Map<String, Object>> distribution = new ArrayList<>();
        for (String bucket : List.of("0", "1", "2", "3-5", "6+")) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("bucket", bucket);
            row.put("cases", byBucket.getOrDefault(bucket, 0L));
            distribution.add(row);
        }
        List<Map<String, Object>> roleMix = new ArrayList<>();
        for (Map<String, Object> r : repo.roleMix(w)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("role", r.get("role"));
            row.put("label", ROLE_LABEL.getOrDefault((String) r.get("role"), (String) r.get("role")));
            row.put("count", r.get("n"));
            roleMix.add(row);
        }
        Map<String, Object> avg = repo.codesPerCaseAvg(w);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("uncoded", ((Number) avg.get("uncoded")).longValue());
        Object avgCodes = avg.get("avg_codes");
        out.put("avgCodesPerCase", avgCodes == null ? null : ((Number) avgCodes).doubleValue());
        out.put("distribution", distribution);
        out.put("roleMix", roleMix);
        return out;
    }

    /** Display names for code_role_t — the enum words are SQL, not UI. */
    private static final Map<String, String> ROLE_LABEL = Map.of(
            "principal_diagnosis", "Principal diagnosis",
            "secondary_diagnosis", "Secondary diagnosis",
            "procedure", "Procedure",
            "other", "Other diagnosis",
            "external_cause", "External cause");

    /**
     * The [POC] case mix: disease group × severity (every group, biggest
     * first — the client decides how many rows fit), plus the sex and age-band
     * splits. `other` catches severity values outside low/medium/high so the
     * row total always reconciles.
     */
    private Map<String, Object> caseMix(Window w) {
        List<Map<String, Object>> groups = new ArrayList<>();
        for (Map<String, Object> r : repo.caseMixByGroup(w)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", r.get("grp"));
            row.put("low", r.get("low"));
            row.put("medium", r.get("medium"));
            row.put("high", r.get("high"));
            row.put("other", r.get("other"));
            row.put("total", r.get("total"));
            groups.add(row);
        }
        List<Map<String, Object>> sex = new ArrayList<>();
        for (Map<String, Object> r : repo.sexCounts(w)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", r.get("sex") == null ? "unspecified" : r.get("sex"));
            row.put("count", r.get("n"));
            sex.add(row);
        }
        List<Map<String, Object>> age = new ArrayList<>();
        for (Map<String, Object> r : repo.ageBands(w)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", r.get("band"));
            row.put("count", r.get("n"));
            age.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("groups", groups);
        out.put("sex", sex);
        out.put("age", age);
        return out;
    }

    /**
     * "code · description" for the bar list, plus the raw parts so a caller
     * can relabel without re-parsing the string. A code the catalog has no
     * description for shows its code alone rather than a dangling separator.
     */
    private List<Map<String, Object>> topCodes(Window w, int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : repo.topCodes(w, limit)) {
            String code = (String) r.get("code");
            String description = (String) r.get("description");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", description == null || description.isBlank()
                    ? code
                    : code + " · " + description);
            row.put("count", r.get("n"));
            row.put("code", code);
            row.put("system", r.get("system"));
            row.put("description", description);
            out.add(row);
        }
        return out;
    }

    /**
     * "Top 10 Principal Diagnosis" — the hospital's card, and NOT a filtered
     * view of topCodes: it ranks only ICD-10 rows in the principal_diagnosis
     * role, so a common procedure or comorbidity cannot outrank a diagnosis.
     * Same row shape as topCodes (system is always "ICD-10") so the frontend
     * can render both with one component.
     */
    private List<Map<String, Object>> topPrincipalDiagnosis(Window w, int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : repo.topPrincipalDiagnosis(w, limit)) {
            String code = (String) r.get("code");
            String description = (String) r.get("description");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", description == null || description.isBlank()
                    ? code
                    : code + " · " + description);
            row.put("count", r.get("n"));
            row.put("code", code);
            row.put("system", "ICD-10");
            row.put("description", description);
            out.add(row);
        }
        return out;
    }

    /**
     * The per-coder KPI table the hospital asked for: finish % and
     * within-7-days %.
     *
     * <p>`finishedPct` is finished ÷ <b>touched</b>, not ÷ assigned — we have no
     * assignment system, so the denominator is the cases the coder acted on at
     * all. `touched` ships alongside precisely so the UI can say which
     * denominator it used instead of implying the hospital's.
     *
     * <p>`within7DaysPct` is over `measured` (finished cases that also have a
     * recorded sync event), never over `finished` — a case whose sync predates
     * the audit trail has no duration and must not count as "late".
     *
     * <p>Both percentages are null rather than 0 when their denominator is
     * empty, so an untouched coder reads as "—" and not as a 0% failure.
     */
    private List<Map<String, Object>> coderKpi(Window w) {
        Map<String, String> names = users.displayNameByStamp();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : repo.coderKpi(w)) {
            String stamp = (String) r.get("stamp");
            long touched = num(r.get("touched"));
            long finished = num(r.get("finished"));
            long measured = num(r.get("measured"));
            long within7 = num(r.get("within7"));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("coder", names.getOrDefault(stamp, stamp));
            row.put("coderId", stamp);
            row.put("touched", touched);
            row.put("finished", finished);
            row.put("finishedPct", pct(finished, touched));
            row.put("measured", measured);
            row.put("within7Days", within7);
            row.put("within7DaysPct", pct(within7, measured));
            out.add(row);
        }
        return out;
    }
}
