package com.medcodeai.api.service;

import com.medcodeai.api.repo.AnalyticsRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
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
 * The summary block is NOT recomputed here — it is lifted verbatim from the
 * dashboard payload (via CasesCache), so the four stat tiles can never drift
 * from the Dashboard's own counts. Everything else is a fresh roll-up.
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

    public Map<String, Object> build(int days, int topCodes, LocalDate today) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary());
        out.put("casesOverTime", casesOverTime(days, today));
        out.put("coverageCounts", coverageCounts());
        out.put("topCodes", topCodes(topCodes));
        out.put("documentationGaps", documentationGaps());
        out.put("codingActivity", codingActivity(days, today));
        out.put("finishedByCoder", finishedByCoder());
        out.put("turnaround", turnaround());
        out.put("codingDepth", codingDepth());
        out.put("caseMix", caseMix());
        return out;
    }

    /**
     * The dashboard's own stats object — same keys, same numbers, including
     * `reopened` (which the Dashboard counts separately and therefore excludes
     * from complete/incomplete/finished; only `total` covers all four queues).
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> summary() {
        Object stats = cache.get(views::buildCasesPayload).get("stats");
        return new LinkedHashMap<>((Map<String, Object>) stats);
    }

    /**
     * Visits per day over the last `days` days ending today, inclusive, with
     * empty days zero-filled so the line has one point per day. `iso` is a
     * local-midnight timestamp with no zone suffix: the browser must read it
     * as the hospital's calendar day, and a `Z` would shift it west of UTC.
     */
    private List<Map<String, Object>> casesOverTime(int days, LocalDate today) {
        LocalDate from = today.minusDays(days - 1L);
        Map<LocalDate, Long> byDay = new HashMap<>();
        for (Map<String, Object> r : repo.casesPerDay(from, today)) {
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
    private List<Map<String, Object>> coverageCounts() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : repo.coverageCounts()) {
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
    private Map<String, Object> documentationGaps() {
        Map<String, String> labels = CasesViewService.missingLabels();
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> r : repo.missingDetailCounts()) {
            String key = (String) r.get("key");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("label", labels.getOrDefault(key, key));
            row.put("count", r.get("n"));
            items.add(row);
        }
        List<Map<String, Object>> byGroup = new ArrayList<>();
        for (Map<String, Object> r : repo.completenessByGroup()) {
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
    private List<Map<String, Object>> codingActivity(int days, LocalDate today) {
        LocalDate from = today.minusDays(days - 1L);
        Map<LocalDate, Map<String, Object>> byDay = new HashMap<>();
        for (Map<String, Object> r : repo.activityPerDay(from, today)) {
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
    private List<Map<String, Object>> finishedByCoder() {
        Map<String, String> names = users.displayNameByStamp();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : repo.finishedByCoder()) {
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
    private Map<String, Object> turnaround() {
        Map<String, Object> r = repo.turnaround();
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
    private Map<String, Object> codingDepth() {
        Map<String, Long> byBucket = new HashMap<>();
        for (Map<String, Object> r : repo.codesPerCaseBuckets()) {
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
        for (Map<String, Object> r : repo.roleMix()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("role", r.get("role"));
            row.put("label", ROLE_LABEL.getOrDefault((String) r.get("role"), (String) r.get("role")));
            row.put("count", r.get("n"));
            roleMix.add(row);
        }
        Map<String, Object> avg = repo.codesPerCaseAvg();
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
    private Map<String, Object> caseMix() {
        List<Map<String, Object>> groups = new ArrayList<>();
        for (Map<String, Object> r : repo.caseMixByGroup()) {
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
        for (Map<String, Object> r : repo.sexCounts()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", r.get("sex") == null ? "unspecified" : r.get("sex"));
            row.put("count", r.get("n"));
            sex.add(row);
        }
        List<Map<String, Object>> age = new ArrayList<>();
        for (Map<String, Object> r : repo.ageBands()) {
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
    private List<Map<String, Object>> topCodes(int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : repo.topCodes(limit)) {
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
}
