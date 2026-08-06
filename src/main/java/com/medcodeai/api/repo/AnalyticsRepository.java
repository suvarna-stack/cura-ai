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
}
