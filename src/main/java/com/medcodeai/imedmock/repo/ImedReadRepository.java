package com.medcodeai.imedmock.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSetMetaData;
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

    public List<Map<String, Object>> cases() {
        return jdbc.query("SELECT * FROM imed.medhack_patient ORDER BY transactionnumber", ROW);
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

    public List<Map<String, Object>> diagnoses(String tn) {
        return byTn("medhack_diagnosis_icd10", tn);
    }

    public List<Map<String, Object>> procedures(String tn) {
        return byTn("medhack_procedure_icd9", tn);
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

    /** The A11 row MedCode AI wrote back, or null when the case is uncoded. */
    public Map<String, Object> codingStatus(String tn) {
        List<Map<String, Object>> r = jdbc.query(
                "SELECT * FROM imed.medhack_casecodingstatus WHERE transactionnumber = ?", ROW, tn);
        return r.isEmpty() ? null : r.get(0);
    }
}
