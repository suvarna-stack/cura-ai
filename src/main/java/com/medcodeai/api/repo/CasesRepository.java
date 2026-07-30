package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSetMetaData;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * All read-side SQL, ported query-for-query from sync/views.py (each method
 * cites its source line). Conventions shared by every query:
 *  - explicit ORDER BY everywhere array/key order reaches the JSON (views.py
 *    comment: SQLite returned implicit rowid order, Postgres guarantees none);
 *  - order_category is a PG ENUM sorting by declaration order, so the CASE
 *    expressions pin the display order — never ORDER BY the bare column;
 *  - enum / timestamp / date / jsonb columns are ::text-cast in the SELECT
 *    list so the driver hands back the wire text, matching psycopg2 with
 *    pgdb.py's raw-text loaders (the JSON contract slices datetimes as text).
 */
@Repository
public class CasesRepository {

    private final JdbcTemplate jdbc;

    public CasesRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Column-order-preserving row mapper; numbers stay numbers, all else text. */
    static final RowMapper<Map<String, Object>> ROW = (rs, i) -> {
        ResultSetMetaData md = rs.getMetaData();
        Map<String, Object> m = new LinkedHashMap<>();
        for (int c = 1; c <= md.getColumnCount(); c++) {
            Object v = rs.getObject(c);
            m.put(md.getColumnLabel(c),
                    (v == null || v instanceof Number || v instanceof Boolean) ? v : rs.getString(c));
        }
        return m;
    };

    // views.py:105 — coverage_types reference (doc B4), all columns
    public List<Map<String, Object>> coverageTypes() {
        return jdbc.query("SELECT * FROM coverage_types", ROW);
    }

    // views.py:115 — CC/PI preview sections, first-wins pick happens in the service
    public List<Map<String, Object>> ccpiRows() {
        return jdbc.query("""
                SELECT case_id, fieldname, value FROM case_report_sections
                WHERE fieldname IN ('Chief Complaint','Present Illness','Subjective') AND value IS NOT NULL
                ORDER BY section_id""", ROW);
    }

    // views.py:122 — code chips, role-priority order then insertion order
    public List<Map<String, Object>> codePreviewRows() {
        return jdbc.query("""
                SELECT cc.case_id, COALESCE(t10.code, t9.code) AS code,
                       CASE WHEN cc.icd_10_id IS NOT NULL THEN 'ICD-10' ELSE 'ICD-9' END AS code_system,
                       cc.code_role::text AS code_role
                FROM case_codes cc
                LEFT JOIN icd_10 t10 ON t10.icd_10_id = cc.icd_10_id
                LEFT JOIN icd_9  t9  ON t9.icd_9_id   = cc.icd_9_id
                WHERE cc.icd_10_id IS NOT NULL OR cc.icd_9_id IS NOT NULL
                ORDER BY CASE cc.code_role WHEN 'principal_diagnosis' THEN 0
                         WHEN 'secondary_diagnosis' THEN 1 WHEN 'procedure' THEN 2 ELSE 3 END,
                         cc.case_code_id""", ROW);
    }

    // views.py:134 — order-category counts per case, CASE pins the key order
    public List<Map<String, Object>> orderCategoryCounts() {
        return jdbc.query("""
                SELECT case_id, order_category::text AS order_category, COUNT(*) n FROM case_orders
                GROUP BY case_id, order_category
                ORDER BY case_id, CASE order_category WHEN 'CT' THEN 0 WHEN 'ROIP' THEN 1
                         WHEN 'X-ray' THEN 2 WHEN 'lab' THEN 3 WHEN 'medicine' THEN 4
                         WHEN 'other' THEN 5 WHEN 'surgery' THEN 6 ELSE 7 END""", ROW);
    }

    // distinct order names per case+category (contract addition 2026-07-27,
    // not in views.py) — feeds the frontend's nested Study/Item filter under
    // each Order Type option. GROUP BY = DISTINCT. The ORDER BY pins the
    // CATEGORY key order only; the names themselves are sorted in the service,
    // since order_name is raw hospital text (much of it Thai) and PG collation
    // disagrees with Java's — same reason sectionRows() re-sorts in code.
    public List<Map<String, Object>> orderNameRows() {
        return jdbc.query("""
                SELECT case_id, order_category::text AS order_category, order_name FROM case_orders
                WHERE order_name IS NOT NULL AND order_name <> ''
                GROUP BY case_id, order_category, order_name
                ORDER BY case_id, CASE order_category WHEN 'CT' THEN 0 WHEN 'ROIP' THEN 1
                         WHEN 'X-ray' THEN 2 WHEN 'lab' THEN 3 WHEN 'medicine' THEN 4
                         WHEN 'other' THEN 5 WHEN 'surgery' THEN 6 ELSE 7 END""", ROW);
    }

    // views.py:145 — every human actor in the audit trail, first-touch order
    public List<Map<String, Object>> coderHistoryRows() {
        return jdbc.query("""
                SELECT case_id, action_detail::text AS action_detail FROM coding_history
                WHERE action_type IN ('approved_single','approved_group','approved_all',
                                      'reopened','code_assigned')
                ORDER BY history_id""", ROW);
    }

    // views.py:195 — finalization info from the audit trail
    public List<Map<String, Object>> approvalRows() {
        return jdbc.query("""
                SELECT case_id, action_detail::text AS action_detail, created_at::text AS created_at FROM coding_history
                WHERE action_type IN ('approved_single','approved_group','approved_all')
                ORDER BY created_at, history_id""", ROW);
    }

    // views.py:208 — last approve/reopen per case; history_id (insertion) order,
    // not created_at: a same-second approve-after-reopen must win
    public List<Map<String, Object>> flowRows() {
        return jdbc.query("""
                SELECT case_id, action_type::text AS action_type, action_detail::text AS action_detail,
                       created_at::text AS created_at FROM coding_history
                WHERE action_type IN ('approved_single','approved_group','approved_all','reopened')
                ORDER BY history_id""", ROW);
    }

    // views.py:219 — dashboard cases = OPD visits only, the columns ui_case reads
    // patient_ref/admissiondatetime/dischargedatetime are real values (may be
    // null for OPD rows the hospital extract doesn't carry them for) used
    // directly by ui_case() instead of synthesized placeholder data.
    public List<Map<String, Object>> opdCases() {
        return jdbc.query("""
                SELECT case_id, sex, department, ward, disease_group, severity_level,
                       coverage_type, encountertype, case_status::text AS case_status,
                       completeness_status::text AS completeness_status, missing_detail,
                       fetched_at::text AS fetched_at, patient_ref,
                       admissiondatetime::text AS admissiondatetime,
                       dischargedatetime::text AS dischargedatetime
                FROM cases WHERE encountertype='0' ORDER BY case_id""", ROW);
    }

    // views.py:289 — full cases row (dict(row)); explicit list in schema column
    // order, date/timestamp/enum columns as text. Null when the case is unknown.
    public Map<String, Object> caseRow(String caseId) {
        List<Map<String, Object>> rows = jdbc.query("""
                SELECT case_id, patient_ref, encountertype, sex, birthdate::text AS birthdate,
                       ageyear, admissiondatetime::text AS admissiondatetime,
                       dischargedatetime::text AS dischargedatetime, dischargetype, dischargestatus,
                       ispregnant, ward, department, coverage_type,
                       completeness_status::text AS completeness_status, missing_detail,
                       disease_group, severity_level, case_status::text AS case_status,
                       fetched_at::text AS fetched_at
                FROM cases WHERE case_id=?""", ROW, caseId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // views.py:293 — full B4 reference row or null
    public Map<String, Object> coverageRow(String coverageCode) {
        if (coverageCode == null) {
            return null;
        }
        List<Map<String, Object>> rows =
                jdbc.query("SELECT * FROM coverage_types WHERE coverage_code=?", ROW, coverageCode);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // views.py:299 — sections in section_id order; the recorddatetime re-sort
    // happens in the service (in Java, stably — never in SQL: SQLite byte order
    // vs Postgres collation disagree)
    public List<Map<String, Object>> sectionRows(String caseId) {
        return jdbc.query("""
                SELECT documenttype, fieldname, value, recorddatetime
                FROM case_report_sections WHERE case_id=? ORDER BY section_id""", ROW, caseId);
    }

    // views.py:310 — detail codes in insertion order
    public List<Map<String, Object>> detailCodeRows(String caseId) {
        return jdbc.query("""
                SELECT COALESCE(t10.code, t9.code) AS code,
                       CASE WHEN cc.icd_10_id IS NOT NULL THEN 'ICD-10' ELSE 'ICD-9' END AS code_system,
                       COALESCE(t10.description, t9.description) AS description,
                       cc.code_role::text AS code_role, cc.source::text AS source,
                       cc.operation_start, cc.operation_end
                FROM case_codes cc
                LEFT JOIN icd_10 t10 ON t10.icd_10_id = cc.icd_10_id
                LEFT JOIN icd_9  t9  ON t9.icd_9_id   = cc.icd_9_id
                WHERE cc.case_id=? AND (cc.icd_10_id IS NOT NULL OR cc.icd_9_id IS NOT NULL)
                ORDER BY cc.case_code_id""", ROW, caseId);
    }

    // views.py:314 — detail orders, category CASE + order_id tiebreak, LIMIT 150
    public List<Map<String, Object>> detailOrderRows(String caseId) {
        return jdbc.query("""
                SELECT order_category::text AS order_category, imed_source, order_name, ordered_at
                FROM case_orders WHERE case_id=?
                ORDER BY CASE order_category WHEN 'CT' THEN 0 WHEN 'ROIP' THEN 1 WHEN 'X-ray' THEN 2
                         WHEN 'lab' THEN 3 WHEN 'medicine' THEN 4 WHEN 'other' THEN 5 WHEN 'surgery' THEN 6
                         ELSE 7 END, order_id LIMIT 150""", ROW, caseId);
    }

    // this case's coder audit trail for the detail `history` array — the same
    // five coder actions coderHistoryRows() counts, scoped to one case, in
    // history_id (insertion) order; action_detail carries {by, at, …} as text.
    public List<Map<String, Object>> caseHistoryRows(String caseId) {
        return jdbc.query("""
                SELECT action_type::text AS action_type, action_detail::text AS action_detail,
                       created_at::text AS created_at FROM coding_history
                WHERE case_id=? AND action_type IN ('approved_single','approved_group',
                      'approved_all','reopened','code_assigned')
                ORDER BY history_id""", ROW, caseId);
    }

    // app.py:126 case_exists()
    public boolean caseExists(String caseId) {
        return !jdbc.queryForList("SELECT 1 FROM cases WHERE case_id=?", caseId).isEmpty();
    }

    /** Total cases in the system — the admin dashboard's "Total Cases" card. */
    public long countCases() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM cases", Long.class);
        return n == null ? 0 : n;
    }
}
