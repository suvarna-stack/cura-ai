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

    public AnalyticsService(AnalyticsRepository repo, CasesCache cache, CasesViewService views) {
        this.repo = repo;
        this.cache = cache;
        this.views = views;
    }

    public Map<String, Object> build(int days, int topCodes, LocalDate today) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary());
        out.put("casesOverTime", casesOverTime(days, today));
        out.put("coverageCounts", coverageCounts());
        out.put("topCodes", topCodes(topCodes));
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
