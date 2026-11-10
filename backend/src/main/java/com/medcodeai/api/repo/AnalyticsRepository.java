package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Aggregates behind GET /api/analytics. Every query is scoped to the same
 * population the dashboard shows — OPD visits only ({@code encountertype='0'})
 * — so a number on the Analytics page can always be traced back to a card on
 * the Dashboard.
 *
 * These are read-only roll-ups over the synced hospital data; nothing here is
 * cached, because each query is a single grouped scan of a table the demo
 * keeps small. If the case count grows past a few tens of thousands, the
 * cheapest fix is to reuse CasesCache rather than to index for these.
 *
 * <p>Every method takes a {@link Window} (added 2026-08-25 for the coder's
 * from/to date filter). {@code Window.all()} reproduces the pre-filter
 * behaviour exactly — the predicate short-circuits on a boolean bind, so rows
 * whose date cannot be derived stay counted as before. A real window excludes
 * them, which is the honest reading of "visits in this range".
 */
@Repository
public class AnalyticsRepository {

    /**
     * The date window the caller asked for. {@code allTime} short-circuits the
     * whole predicate, so the un-filtered page keeps counting rows with no
     * derivable date; a concrete window drops them.
     *
     * <p>Bound as three non-null params in the order (allTime, from, to) —
     * deliberately not as nullable dates, because a bare JDBC null has no type
     * for Postgres to infer and would need a cast dance at every call site.
     */
    public record Window(boolean allTime, String from, String to) {

        /** No filtering: every row the population query would have returned. */
        public static Window all() {
            return new Window(true, "1900-01-01", "2999-12-31");
        }

        /** Inclusive on both ends — `to` is a day the user picked, not a bound. */
        public static Window of(LocalDate from, LocalDate to) {
            return new Window(false, from.toString(), to.toString());
        }

        private Object[] args() {
            return new Object[]{allTime, from, to};
        }
    }

    /**
     * A visit's datetime, mirroring imed-mock-api's ImedReadRepository.VISIT_DT
     * so both systems date a visit identically: admissiondatetime when the
     * extract filled it (IPD), else the YYMMDDHHMMSS the hospital encodes in
     * positions 4-15 of the transaction number (= our case_id). NULL when
     * neither parses — those rows are simply absent from the time series.
     */
    private static final String VISIT_DT = """
            COALESCE(c.admissiondatetime,
                     CASE WHEN c.case_id ~ '^...[0-9]{12}'
                          THEN to_timestamp(substring(c.case_id from 4 for 12),
                                            'YYMMDDHH24MISS')::timestamp END)""";

    /** Visit falls inside the window (or the window is "all time"). */
    private static final String VISIT_WINDOW = """
             AND (CAST(? AS boolean)
                  OR (%s >= CAST(? AS date) AND %s < CAST(? AS date) + 1))"""
            .formatted(VISIT_DT, VISIT_DT);

    /**
     * Audit action falls inside the window. Cards about what coders DID use the
     * action's own date, not the visit date — "finished in July" means the
     * coder finished it in July, whenever the patient happened to come in.
     */
    private static final String ACTION_WINDOW = """
             AND (CAST(? AS boolean)
                  OR (ch.created_at >= CAST(? AS date)
                      AND ch.created_at < CAST(? AS date) + 1))""";

    private final JdbcTemplate jdbc;

    public AnalyticsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Window params first, then the query's own — matches the SQL's ? order. */
    private static Object[] args(Window w, Object... rest) {
        List<Object> all = new ArrayList<>(List.of(w.args()));
        all.addAll(List.of(rest));
        return all.toArray();
    }

    /**
     * The four dashboard queues counted in SQL, for a windowed page.
     *
     * <p>Deliberately mirrors CasesViewService.buildCasesPayload()'s routing so
     * a windowed summary and the cached one agree when the window is all-time:
     * approved wins outright; otherwise a case whose LAST flow action was a
     * reopen (demo.reset excluded, as everywhere) is reopened; otherwise
     * completeness_status decides. The service still prefers the CasesCache
     * when no window is set, so the un-filtered tiles can never drift from the
     * Dashboard — this query serves the filtered path only.
     */
    public Map<String, Object> summary(Window w) {
        return jdbc.queryForMap("""
                WITH last_flow AS (
                    SELECT DISTINCT ON (ch.case_id)
                           ch.case_id,
                           ch.action_type,
                           COALESCE(ch.action_detail->>'by', '') AS by
                      FROM coding_history ch
                     WHERE ch.action_type IN ('approved_single', 'approved_group',
                                              'approved_all', 'reopened')
                     ORDER BY ch.case_id, ch.history_id DESC)
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE c.case_status = 'approved') AS finished,
                       count(*) FILTER (WHERE c.case_status <> 'approved'
                             AND COALESCE(lf.action_type = 'reopened'
                                          AND lf.by <> 'demo.reset', false)) AS reopened,
                       count(*) FILTER (WHERE c.case_status <> 'approved'
                             AND NOT COALESCE(lf.action_type = 'reopened'
                                              AND lf.by <> 'demo.reset', false)
                             AND c.completeness_status = 'complete') AS complete,
                       count(*) FILTER (WHERE c.case_status <> 'approved'
                             AND NOT COALESCE(lf.action_type = 'reopened'
                                              AND lf.by <> 'demo.reset', false)
                             AND c.completeness_status IS DISTINCT FROM 'complete') AS incomplete
                  FROM cases c
                  LEFT JOIN last_flow lf ON lf.case_id = c.case_id
                 WHERE c.encountertype = '0'
                 %s""".formatted(VISIT_WINDOW), w.args());
    }

    /**
     * New OPD visits per calendar day within [from, to] inclusive. Days with
     * no visit are absent — the service zero-fills, so a gap in the hospital's
     * week reads as a zero on the chart rather than a missing point.
     */
    public List<Map<String, Object>> casesPerDay(LocalDate from, LocalDate to) {
        return jdbc.queryForList("""
                SELECT %s::date AS day, count(*) AS n
                  FROM cases c
                 WHERE c.encountertype = '0'
                   AND %s >= ?::date
                   AND %s < (?::date + 1)
                 GROUP BY 1
                 ORDER BY 1""".formatted(VISIT_DT, VISIT_DT, VISIT_DT),
                from.toString(), to.toString());
    }

    /**
     * OPD visits per coverage scheme family (UCS / OFC / WEL / …). Grouped by
     * family, not by the raw coverage_code: the extract carries ~40 codes that
     * are variants of a handful of schemes (UCS_89, UCS_89_I, …), and the
     * donut is a breakdown of สิทธิการรักษา, not of billing sub-codes.
     * Visits whose coverage the extract left blank group under NULL and the
     * service labels them.
     */
    public List<Map<String, Object>> coverageCounts(Window w) {
        return jdbc.queryForList("""
                SELECT NULLIF(ct.scheme_family, '') AS family, count(*) AS n
                  FROM cases c
                  LEFT JOIN coverage_types ct ON ct.coverage_code = c.coverage_type
                 WHERE c.encountertype = '0'
                 %s
                 GROUP BY 1
                 ORDER BY n DESC, family""".formatted(VISIT_WINDOW), w.args());
    }

    /**
     * The most-assigned codes across OPD visits, both catalogs in one ranking
     * (the card is "Top ICD Codes", and an ICD-9 procedure competes with an
     * ICD-10 diagnosis for the coder's attention just the same). Counts every
     * row in case_codes — imported-from-iMed and coder-assigned alike.
     */
    public List<Map<String, Object>> topCodes(Window w, int limit) {
        return jdbc.queryForList("""
                SELECT COALESCE(i10.code, i9.code) AS code,
                       CASE WHEN cc.icd_10_id IS NOT NULL THEN 'ICD-10' ELSE 'ICD-9' END AS system,
                       COALESCE(NULLIF(i10.description, ''), NULLIF(i9.description, '')) AS description,
                       count(*) AS n
                  FROM case_codes cc
                  JOIN cases c ON c.case_id = cc.case_id AND c.encountertype = '0'
                  LEFT JOIN icd_10 i10 ON i10.icd_10_id = cc.icd_10_id
                  LEFT JOIN icd_9  i9  ON i9.icd_9_id  = cc.icd_9_id
                 WHERE true
                 %s
                 GROUP BY 1, 2, 3
                 ORDER BY n DESC, code
                 LIMIT ?""".formatted(VISIT_WINDOW), args(w, limit));
    }

    /**
     * The coder's "Top 10 Principal Diagnosis" card: ICD-10 rows carrying the
     * principal_diagnosis role only, one row per code.
     *
     * <p>Deliberately distinct from {@link #topCodes} — that card ranks every
     * assigned code across both catalogs, so a frequent procedure or
     * comorbidity outranks the principal diagnoses the coder actually asked to
     * see. Restricted to icd_10 because principal_diagnosis is only ever
     * written against the ICD-10 catalog (procedures take the ICD-9 side with
     * role 'procedure').
     */
    public List<Map<String, Object>> topPrincipalDiagnosis(Window w, int limit) {
        return jdbc.queryForList("""
                SELECT i10.code AS code,
                       NULLIF(i10.description, '') AS description,
                       count(*) AS n
                  FROM case_codes cc
                  JOIN cases c ON c.case_id = cc.case_id AND c.encountertype = '0'
                  JOIN icd_10 i10 ON i10.icd_10_id = cc.icd_10_id
                 WHERE cc.code_role = 'principal_diagnosis'
                 %s
                 GROUP BY 1, 2
                 ORDER BY n DESC, code
                 LIMIT ?""".formatted(VISIT_WINDOW), args(w, limit));
    }

    /**
     * How often each missing item appears across incomplete OPD cases.
     * `missing_detail` is a comma-joined key list ("icd10,icd9" under the
     * 2026-08-05 rule; documentation keys on rows synced before it), so one
     * case counts once per missing item, not once overall.
     */
    public List<Map<String, Object>> missingDetailCounts(Window w) {
        return jdbc.queryForList("""
                SELECT trim(t) AS key, count(*) AS n
                  FROM cases c,
                       unnest(string_to_array(c.missing_detail, ',')) AS t
                 WHERE c.encountertype = '0'
                   AND c.completeness_status = 'incomplete'
                   AND COALESCE(c.missing_detail, '') <> ''
                 %s
                 GROUP BY 1
                 ORDER BY n DESC, key""".formatted(VISIT_WINDOW), w.args());
    }

    /**
     * Incomplete vs total per disease group, most incomplete first. The blank
     * group folds into 'Ungrouped' — the same word the sync rules write — so
     * the card never shows an unlabeled bar.
     */
    public List<Map<String, Object>> completenessByGroup(Window w) {
        return jdbc.queryForList("""
                SELECT COALESCE(NULLIF(c.disease_group, ''), 'Ungrouped') AS grp,
                       count(*) FILTER (WHERE c.completeness_status = 'incomplete') AS incomplete,
                       count(*) AS total
                  FROM cases c
                 WHERE c.encountertype = '0'
                 %s
                 GROUP BY 1
                 ORDER BY 2 DESC, 3 DESC, grp""".formatted(VISIT_WINDOW), w.args());
    }

    /**
     * Coder actions per calendar day within [from, to] inclusive, from the
     * audit trail. Approvals count the three approve variants as one thing —
     * the card asks "how many cases got approved", not which button did it.
     * Days with no action are absent; the service zero-fills.
     */
    public List<Map<String, Object>> activityPerDay(LocalDate from, LocalDate to) {
        return jdbc.queryForList("""
                SELECT ch.created_at::date AS day,
                       count(*) FILTER (WHERE ch.action_type IN
                           ('approved_single', 'approved_group', 'approved_all')) AS approved,
                       count(*) FILTER (WHERE ch.action_type = 'code_assigned') AS coded,
                       count(*) FILTER (WHERE ch.action_type = 'reopened') AS reopened
                  FROM coding_history ch
                  JOIN cases c ON c.case_id = ch.case_id AND c.encountertype = '0'
                 WHERE ch.created_at >= ?::date
                   AND ch.created_at < (?::date + 1)
                 GROUP BY 1
                 ORDER BY 1""", from.toString(), to.toString());
    }

    /**
     * Sync-to-approval turnaround over every OPD case that has both events,
     * as median / p90 minutes. First sync to FIRST approval: a case reopened
     * and re-approved keeps its original turnaround rather than improving it.
     * All-null row (n = 0) when nothing has been approved yet. Windowed on the
     * approval — the question is "how fast was work finished in this period",
     * so it is the approval that has to fall inside it.
     */
    public Map<String, Object> turnaround(Window w) {
        return jdbc.queryForMap("""
                SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY mins) AS median_minutes,
                       percentile_cont(0.9) WITHIN GROUP (ORDER BY mins) AS p90_minutes,
                       count(*) AS n
                  FROM (SELECT extract(epoch FROM
                                   min(ch.created_at) FILTER (WHERE ch.action_type IN
                                       ('approved_single', 'approved_group', 'approved_all')
                                       AND (CAST(? AS boolean)
                                            OR (ch.created_at >= CAST(? AS date)
                                                AND ch.created_at < CAST(? AS date) + 1)))
                                 - min(ch.created_at) FILTER (WHERE ch.action_type = 'case_synced')
                               ) / 60 AS mins
                          FROM coding_history ch
                          JOIN cases c ON c.case_id = ch.case_id AND c.encountertype = '0'
                         GROUP BY ch.case_id) t
                 WHERE t.mins IS NOT NULL AND t.mins >= 0""", w.args());
    }

    /**
     * OPD cases bucketed by how many codes they carry. Buckets are labeled
     * here (single source of truth for the boundaries); `ord` carries the
     * display order so the service never re-parses the labels.
     */
    public List<Map<String, Object>> codesPerCaseBuckets(Window w) {
        return jdbc.queryForList("""
                SELECT CASE WHEN t.n = 0 THEN '0'
                            WHEN t.n = 1 THEN '1'
                            WHEN t.n = 2 THEN '2'
                            WHEN t.n <= 5 THEN '3-5'
                            ELSE '6+' END AS bucket,
                       min(CASE WHEN t.n = 0 THEN 0
                                WHEN t.n = 1 THEN 1
                                WHEN t.n = 2 THEN 2
                                WHEN t.n <= 5 THEN 3
                                ELSE 4 END) AS ord,
                       count(*) AS cases
                  FROM (SELECT c.case_id, count(cc.case_code_id) AS n
                          FROM cases c
                          LEFT JOIN case_codes cc ON cc.case_id = c.case_id
                         WHERE c.encountertype = '0'
                         %s
                         GROUP BY c.case_id) t
                 GROUP BY 1
                 ORDER BY 2""".formatted(VISIT_WINDOW), w.args());
    }

    /** Average codes per OPD case, uncoded cases included in the denominator. */
    public Map<String, Object> codesPerCaseAvg(Window w) {
        return jdbc.queryForMap("""
                SELECT round(avg(t.n), 1) AS avg_codes,
                       count(*) FILTER (WHERE t.n = 0) AS uncoded
                  FROM (SELECT count(cc.case_code_id) AS n
                          FROM cases c
                          LEFT JOIN case_codes cc ON cc.case_id = c.case_id
                         WHERE c.encountertype = '0'
                         %s
                         GROUP BY c.case_id) t""".formatted(VISIT_WINDOW), w.args());
    }

    /** case_codes rows per role across OPD cases, biggest first. */
    public List<Map<String, Object>> roleMix(Window w) {
        return jdbc.queryForList("""
                SELECT cc.code_role::text AS role, count(*) AS n
                  FROM case_codes cc
                  JOIN cases c ON c.case_id = cc.case_id AND c.encountertype = '0'
                 WHERE cc.code_role IS NOT NULL
                 %s
                 GROUP BY 1
                 ORDER BY n DESC, role""".formatted(VISIT_WINDOW), w.args());
    }

    /**
     * Approved (finished) OPD cases per coder, biggest first. The coder is
     * the `by` stamp of each case's LATEST approval action (history_id
     * order, same rule as the dashboard's finished queue) — a case reopened
     * and re-approved by someone else counts for its current approver only.
     */
    public List<Map<String, Object>> finishedByCoder(Window w) {
        return jdbc.queryForList("""
                SELECT COALESCE(NULLIF(t.by, ''), '—') AS stamp, count(*) AS n
                  FROM (SELECT DISTINCT ON (ch.case_id)
                               ch.case_id, ch.action_detail->>'by' AS by
                          FROM coding_history ch
                          JOIN cases c ON c.case_id = ch.case_id
                           AND c.encountertype = '0'
                           AND c.case_status = 'approved'
                         WHERE ch.action_type IN
                               ('approved_single', 'approved_group', 'approved_all')
                         %s
                         ORDER BY ch.case_id, ch.history_id DESC) t
                 GROUP BY 1
                 ORDER BY n DESC, stamp""".formatted(ACTION_WINDOW), w.args());
    }

    /**
     * The coder's KPI table: per account, how much of the work they touched
     * they actually finished, and how much of it they finished inside 7 days.
     *
     * <p><b>What "finish %" means here.</b> The hospital's request assumes an
     * assignment system ("% of the cases assigned to me that I finished"). We
     * have no assignment — nothing writes an assignee — so the denominator is
     * the cases the coder <em>touched</em>: any audit action attributable to
     * them. That is the closest honest reading of the same question, and it
     * upgrades to the intended meaning the day assignment exists by swapping
     * `touched` for `assigned`. The payload names the denominator so the UI
     * can label it truthfully; never present it as assignment-based.
     *
     * <p>`within7` counts finished cases whose first-sync → this-approval gap
     * is under 7 days. A case with no recorded sync cannot be measured, so it
     * is excluded from both `within7` and `measured` while still counting in
     * `finished` — the percentage is over `measured`, never over an inflated
     * denominator.
     *
     * <p>demo.reset churn is excluded exactly as the dashboard excludes it.
     */
    public List<Map<String, Object>> coderKpi(Window w) {
        return jdbc.queryForList("""
                WITH acts AS (
                    SELECT ch.case_id, ch.action_type, ch.history_id, ch.created_at,
                           ch.action_detail->>'by' AS by
                      FROM coding_history ch
                      JOIN cases c ON c.case_id = ch.case_id AND c.encountertype = '0'
                     WHERE COALESCE(ch.action_detail->>'by', '') NOT IN ('', 'demo.reset')
                     %s),
                touched AS (
                    SELECT by, count(DISTINCT case_id) AS n FROM acts GROUP BY 1),
                synced AS (
                    SELECT ch.case_id, min(ch.created_at) AS at
                      FROM coding_history ch
                     WHERE ch.action_type = 'case_synced'
                     GROUP BY 1),
                last_approval AS (
                    SELECT DISTINCT ON (a.case_id) a.case_id, a.by, a.created_at
                      FROM acts a
                     WHERE a.action_type IN ('approved_single', 'approved_group', 'approved_all')
                     ORDER BY a.case_id, a.history_id DESC),
                fin AS (
                    SELECT la.by,
                           count(*) AS n,
                           count(*) FILTER (WHERE s.at IS NOT NULL) AS measured,
                           count(*) FILTER (WHERE s.at IS NOT NULL
                                 AND la.created_at - s.at < interval '7 days') AS within7
                      FROM last_approval la
                      JOIN cases c ON c.case_id = la.case_id AND c.case_status = 'approved'
                      LEFT JOIN synced s ON s.case_id = la.case_id
                     GROUP BY 1)
                SELECT COALESCE(t.by, f.by) AS stamp,
                       COALESCE(t.n, 0) AS touched,
                       COALESCE(f.n, 0) AS finished,
                       COALESCE(f.measured, 0) AS measured,
                       COALESCE(f.within7, 0) AS within7
                  FROM touched t
                  FULL JOIN fin f ON f.by = t.by
                 ORDER BY finished DESC, touched DESC, stamp""".formatted(ACTION_WINDOW),
                w.args());
    }

    /**
     * OPD cases per disease group, split by severity. severity_level is
     * free-ish text but the sync rules only ever write low/medium/high;
     * anything else lands in `other` so the row total always adds up.
     */
    public List<Map<String, Object>> caseMixByGroup(Window w) {
        return jdbc.queryForList("""
                SELECT COALESCE(NULLIF(c.disease_group, ''), 'Ungrouped') AS grp,
                       count(*) FILTER (WHERE c.severity_level = 'low') AS low,
                       count(*) FILTER (WHERE c.severity_level = 'medium') AS medium,
                       count(*) FILTER (WHERE c.severity_level = 'high') AS high,
                       count(*) FILTER (WHERE c.severity_level IS NULL
                           OR c.severity_level NOT IN ('low', 'medium', 'high')) AS other,
                       count(*) AS total
                  FROM cases c
                 WHERE c.encountertype = '0'
                 %s
                 GROUP BY 1
                 ORDER BY total DESC, grp""".formatted(VISIT_WINDOW), w.args());
    }

    /** OPD visits by patient sex, biggest first; blank groups under NULL. */
    public List<Map<String, Object>> sexCounts(Window w) {
        return jdbc.queryForList("""
                SELECT NULLIF(c.sex, '') AS sex, count(*) AS n
                  FROM cases c
                 WHERE c.encountertype = '0'
                 %s
                 GROUP BY 1
                 ORDER BY n DESC""".formatted(VISIT_WINDOW), w.args());
    }

    /**
     * OPD visits by patient age band, age taken from birthdate as of today
     * (ageyear is a "y,m,d" string frozen at extract time — not arithmetic-
     * friendly and staler than the birthdate it was derived from).
     */
    public List<Map<String, Object>> ageBands(Window w) {
        return jdbc.queryForList("""
                SELECT CASE WHEN t.years < 15 THEN '0-14'
                            WHEN t.years < 40 THEN '15-39'
                            WHEN t.years < 60 THEN '40-59'
                            ELSE '60+' END AS band,
                       min(CASE WHEN t.years < 15 THEN 0
                                WHEN t.years < 40 THEN 1
                                WHEN t.years < 60 THEN 2
                                ELSE 3 END) AS ord,
                       count(*) AS n
                  FROM (SELECT date_part('year', age(current_date, c.birthdate)) AS years
                          FROM cases c
                         WHERE c.encountertype = '0'
                           AND c.birthdate IS NOT NULL
                         %s) t
                 GROUP BY 1
                 ORDER BY 2""".formatted(VISIT_WINDOW), w.args());
    }
}
