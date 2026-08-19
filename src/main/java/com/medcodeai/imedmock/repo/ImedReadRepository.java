package com.medcodeai.imedmock.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSetMetaData;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read side of the hospital API: every endpoint serves one medhack_* table
 * verbatim — the exact extract column names, TEXT values as stored (the
 * extracts' non-uniform datetime formats included; parsing is the CALLER's
 * job, per Data Mapping Q5). This is the spec-by-example for the data the
 * hospital must expose in production.
 */
@Repository
public class ImedReadRepository {

    private final JdbcTemplate jdbc;

    public ImedReadRepository(JdbcTemplate jdbc) {
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

    public boolean caseExists(String tn) {
        return !jdbc.queryForList(
                "SELECT 1 FROM imed.medhack_patient WHERE transactionnumber = ? LIMIT 1", tn).isEmpty();
    }

    /**
     * A visit's datetime for the from/to filter: admissiondatetime when the
     * extract filled it (IPD), else the YYMMDDHHMMSS the hospital encodes in
     * positions 4-15 of the transaction number (matches the notes'
     * recorddatetime on every seeded visit). NULL when neither parses — such
     * rows never match a window filter.
     */
    static final String VISIT_DT = """
            COALESCE(
              CASE WHEN p.admissiondatetime ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                   THEN p.admissiondatetime::timestamp END,
              CASE WHEN p.transactionnumber ~ '^...[0-9]{12}'
                   THEN to_timestamp(substring(p.transactionnumber from 4 for 12),
                                     'YYMMDDHH24MISS')::timestamp END)""";

    /**
     * When the visit's data last changed: the newest updated_at across its
     * code rows (stamped by every /api/v1 write, cancels included), floored
     * at the visit datetime itself (seed rows carry no stamp — their change
     * time is the visit).
     */
    static final String LAST_CHANGED = """
            GREATEST(""" + VISIT_DT + """
            ,
              (SELECT max(d.updated_at::timestamp) FROM imed.medhack_diagnosis_icd10 d
                WHERE d.transactionnumber = p.transactionnumber
                  AND d.updated_at ~ '^[0-9]{4}-'),
              (SELECT max(pr.updated_at::timestamp) FROM imed.medhack_procedure_icd9 pr
                WHERE pr.transactionnumber = p.transactionnumber
                  AND pr.updated_at ~ '^[0-9]{4}-'))""";

    /** All visits, optionally windowed; every bound is inclusive and pre-normalized by the controller. */
    public List<Map<String, Object>> cases(String from, String to, String changedSince) {
        StringBuilder sql = new StringBuilder("SELECT p.* FROM imed.medhack_patient p WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (from != null) {
            sql.append(" AND ").append(VISIT_DT).append(" >= ?::timestamp");
            params.add(from);
        }
        if (to != null) {
            sql.append(" AND ").append(VISIT_DT).append(" <= ?::timestamp");
            params.add(to);
        }
        if (changedSince != null) {
            sql.append(" AND ").append(LAST_CHANGED).append(" >= ?::timestamp");
            params.add(changedSince);
        }
        sql.append(" ORDER BY transactionnumber");
        return jdbc.query(sql.toString(), ROW, params.toArray());
    }

    // one method per table; tn-scoped, insertion order (no reliable natural key)
    private List<Map<String, Object>> byTn(String table, String tn) {
        return jdbc.query("SELECT * FROM imed." + table + " WHERE transactionnumber = ?", ROW, tn);
    }

    public List<Map<String, Object>> medicalRecords(String tn) {
        return byTn("medhack_medicalrecord", tn);
    }

    public List<Map<String, Object>> medicalRecordResults(String tn) {
        return byTn("medhack_medicalrecord_result", tn);
    }

    // Cancelled rows stay in the tables (the /api/v1 DELETE is iMed's cancel
    // flow — audit trail, no hard delete) but are invisible to reads: without
    // this filter a sync would resurrect codes a coder deliberately removed.
    public List<Map<String, Object>> diagnoses(String tn) {
        return jdbc.query("""
                SELECT * FROM imed.medhack_diagnosis_icd10
                WHERE transactionnumber = ? AND is_cancelled IS DISTINCT FROM '1'""", ROW, tn);
    }

    public List<Map<String, Object>> procedures(String tn) {
        return jdbc.query("""
                SELECT * FROM imed.medhack_procedure_icd9
                WHERE transactionnumber = ? AND is_cancelled IS DISTINCT FROM '1'""", ROW, tn);
    }

    public List<Map<String, Object>> orderDrugs(String tn) {
        return byTn("medhack_orderdrug", tn);
    }

    public List<Map<String, Object>> orderLabs(String tn) {
        return byTn("medhack_orderlab", tn);
    }

    public List<Map<String, Object>> vitalSigns(String tn) {
        return byTn("medhack_vitalsign", tn);
    }

    public List<Map<String, Object>> bedManagement(String tn) {
        return byTn("medhack_bedmanagement", tn);
    }

    public List<Map<String, Object>> billingItems(String tn) {
        return byTn("medhack_billingitem", tn);
    }

    // ICD reference catalogs (code master, not per-case) — MedCode AI pulls
    // these during sync to keep its own icd_10/icd_9 tables aligned.
    public List<Map<String, Object>> icd10Catalog() {
        return jdbc.query("SELECT * FROM imed.icd_10 ORDER BY code", ROW);
    }

    public List<Map<String, Object>> icd9Catalog() {
        return jdbc.query("SELECT * FROM imed.icd_9 ORDER BY code", ROW);
    }
}
