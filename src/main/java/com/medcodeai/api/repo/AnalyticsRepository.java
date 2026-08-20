package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
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
 */
@Repository
public class AnalyticsRepository {

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

    private final JdbcTemplate jdbc;

    public AnalyticsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
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
    public List<Map<String, Object>> coverageCounts() {
        return jdbc.queryForList("""
                SELECT NULLIF(ct.scheme_family, '') AS family, count(*) AS n
                  FROM cases c
                  LEFT JOIN coverage_types ct ON ct.coverage_code = c.coverage_type
                 WHERE c.encountertype = '0'
                 GROUP BY 1
                 ORDER BY n DESC, family""");
    }

    /**
     * The most-assigned codes across OPD visits, both catalogs in one ranking
     * (the card is "Top ICD Codes", and an ICD-9 procedure competes with an
     * ICD-10 diagnosis for the coder's attention just the same). Counts every
     * row in case_codes — imported-from-iMed and coder-assigned alike.
     */
    public List<Map<String, Object>> topCodes(int limit) {
        return jdbc.queryForList("""
                SELECT COALESCE(i10.code, i9.code) AS code,
                       CASE WHEN cc.icd_10_id IS NOT NULL THEN 'ICD-10' ELSE 'ICD-9' END AS system,
                       COALESCE(NULLIF(i10.description, ''), NULLIF(i9.description, '')) AS description,
                       count(*) AS n
                  FROM case_codes cc
                  JOIN cases c ON c.case_id = cc.case_id AND c.encountertype = '0'
                  LEFT JOIN icd_10 i10 ON i10.icd_10_id = cc.icd_10_id
                  LEFT JOIN icd_9  i9  ON i9.icd_9_id  = cc.icd_9_id
                 GROUP BY 1, 2, 3
                 ORDER BY n DESC, code
                 LIMIT ?""", limit);
    }

    /**
     * How often each missing item appears across incomplete OPD cases.
     * `missing_detail` is a comma-joined key list ("icd10,icd9" under the
     * 2026-08-05 rule; documentation keys on rows synced before it), so one
     * case counts once per missing item, not once overall.
     */
    public List<Map<String, Object>> missingDetailCounts() {
        return jdbc.queryForList("""
                SELECT trim(t) AS key, count(*) AS n
                  FROM cases c,
                       unnest(string_to_array(c.missing_detail, ',')) AS t
                 WHERE c.encountertype = '0'
                   AND c.completeness_status = 'incomplete'
                   AND COALESCE(c.missing_detail, '') <> ''
                 GROUP BY 1
                 ORDER BY n DESC, key""");
    }

    /**
     * Incomplete vs total per disease group, most incomplete first. The blank
     * group folds into 'Ungrouped' — the same word the sync rules write — so
     * the card never shows an unlabeled bar.
     */
    public List<Map<String, Object>> completenessByGroup() {
        return jdbc.queryForList("""
                SELECT COALESCE(NULLIF(c.disease_group, ''), 'Ungrouped') AS grp,
                       count(*) FILTER (WHERE c.completeness_status = 'incomplete') AS incomplete,
                       count(*) AS total
                  FROM cases c
                 WHERE c.encountertype = '0'
                 GROUP BY 1
                 ORDER BY 2 DESC, 3 DESC, grp""");
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
     * All-null row (n = 0) when nothing has been approved yet.
     */
    public Map<String, Object> turnaround() {
        return jdbc.queryForMap("""
                SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY mins) AS median_minutes,
                       percentile_cont(0.9) WITHIN GROUP (ORDER BY mins) AS p90_minutes,
                       count(*) AS n
                  FROM (SELECT extract(epoch FROM
                                   min(ch.created_at) FILTER (WHERE ch.action_type IN
                                       ('approved_single', 'approved_group', 'approved_all'))
                                 - min(ch.created_at) FILTER (WHERE ch.action_type = 'case_synced')
                               ) / 60 AS mins
                          FROM coding_history ch
                          JOIN cases c ON c.case_id = ch.case_id AND c.encountertype = '0'
                         GROUP BY ch.case_id) t
                 WHERE t.mins IS NOT NULL AND t.mins >= 0""");
    }

    /**
     * OPD cases bucketed by how many codes they carry. Buckets are labeled
     * here (single source of truth for the boundaries); `ord` carries the
     * display order so the service never re-parses the labels.
     */
    public List<Map<String, Object>> codesPerCaseBuckets() {
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
                         GROUP BY c.case_id) t
                 GROUP BY 1
                 ORDER BY 2""");
    }

    /** Average codes per OPD case, uncoded cases included in the denominator. */
    public Map<String, Object> codesPerCaseAvg() {
        return jdbc.queryForMap("""
                SELECT round(avg(t.n), 1) AS avg_codes,
                       count(*) FILTER (WHERE t.n = 0) AS uncoded
                  FROM (SELECT count(cc.case_code_id) AS n
                          FROM cases c
                          LEFT JOIN case_codes cc ON cc.case_id = c.case_id
                         WHERE c.encountertype = '0'
                         GROUP BY c.case_id) t""");
    }

    /** case_codes rows per role across OPD cases, biggest first. */
    public List<Map<String, Object>> roleMix() {
        return jdbc.queryForList("""
                SELECT cc.code_role::text AS role, count(*) AS n
                  FROM case_codes cc
                  JOIN cases c ON c.case_id = cc.case_id AND c.encountertype = '0'
                 WHERE cc.code_role IS NOT NULL
                 GROUP BY 1
                 ORDER BY n DESC, role""");
    }

    /**
     * OPD cases per disease group, split by severity. severity_level is
     * free-ish text but the sync rules only ever write low/medium/high;
     * anything else lands in `other` so the row total always adds up.
     */
    public List<Map<String, Object>> caseMixByGroup() {
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
                 GROUP BY 1
                 ORDER BY total DESC, grp""");
    }

    /** OPD visits by patient sex, biggest first; blank groups under NULL. */
    public List<Map<String, Object>> sexCounts() {
        return jdbc.queryForList("""
                SELECT NULLIF(c.sex, '') AS sex, count(*) AS n
                  FROM cases c
                 WHERE c.encountertype = '0'
                 GROUP BY 1
                 ORDER BY n DESC""");
    }

    /**
     * OPD visits by patient age band, age taken from birthdate as of today
     * (ageyear is a "y,m,d" string frozen at extract time — not arithmetic-
     * friendly and staler than the birthdate it was derived from).
     */
    public List<Map<String, Object>> ageBands() {
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
                           AND c.birthdate IS NOT NULL) t
                 GROUP BY 1
                 ORDER BY 2""");
    }
}
