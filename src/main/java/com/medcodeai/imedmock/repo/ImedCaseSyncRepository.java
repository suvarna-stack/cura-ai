package com.medcodeai.imedmock.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read side of the "MedCode AI Case Data API" contract (R1-R6) — the shape
 * MedCode AI asked the hospital to build, mocked here first so development
 * doesn't wait for the hospital's implementation.
 *
 * The medhack_* extract tables are re-shaped into the contract's nested CASE
 * OBJECT: one visit block plus nine data blocks, every key renamed to the
 * contract's snake_case vocabulary (transactionnumber → visit_id, icd →
 * icd10_code, startdatetime → operation_start, …). This replaced the older
 * one-endpoint-per-table read layer, which was removed once medcode-api
 * stopped calling it.
 *
 * Three transport rules from the contract are enforced HERE rather than left
 * to the caller, because on the real API they are the hospital's job:
 *
 * - Date-times are ISO 8601 ("2026-04-01T06:45:00"). The extract stores
 *   "2026-04-01 06:45:00", so every datetime is normalized on the way out.
 * - Missing values are null — never an empty string, never an absent key.
 *   The extract uses both NULL and '' for "nothing", so blanks collapse.
 * - Cancelled diagnosis/procedure rows must never appear (a code a coder
 *   deliberately removed would otherwise return on the next sync).
 *
 * Batches are small by contract (R2 caps at 20 visits), so each block is one
 * query over the whole batch grouped in memory — 10 queries per call, not 10
 * per case.
 */
@Repository
public class ImedCaseSyncRepository {

    private final JdbcTemplate jdbc;

    public ImedCaseSyncRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * A visit's datetime for the from/to filter: admissiondatetime when the
     * extract filled it (IPD), else the YYMMDDHHMMSS the hospital encodes in
     * positions 4-15 of the transaction number (matches the notes'
     * recorddatetime on every seeded visit). NULL when neither parses — such
     * rows never match a window filter.
     */
    private static final String VISIT_DT = """
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
    private static final String LAST_CHANGED = """
            GREATEST(""" + VISIT_DT + """
            ,
              (SELECT max(d.updated_at::timestamp) FROM imed.medhack_diagnosis_icd10 d
                WHERE d.transactionnumber = p.transactionnumber
                  AND d.updated_at ~ '^[0-9]{4}-'),
              (SELECT max(pr.updated_at::timestamp) FROM imed.medhack_procedure_icd9 pr
                WHERE pr.transactionnumber = p.transactionnumber
                  AND pr.updated_at ~ '^[0-9]{4}-'))""";

    /** Does the hospital know this visit? Used by the write API's validation. */
    public boolean caseExists(String tn) {
        return !jdbc.queryForList(
                "SELECT 1 FROM imed.medhack_patient WHERE transactionnumber = ? LIMIT 1", tn).isEmpty();
    }

    // ---- R1 / R3: which visits ---------------------------------------------

    /**
     * R1 — visits whose data changed at or after the bound. "Changed" is the
     * visit's own datetime (so a new visit counts) or any later write to its
     * code rows; see {@link #LAST_CHANGED}.
     */
    public List<String> changedVisitIds(String changedSince) {
        return jdbc.queryForList("""
                SELECT p.transactionnumber FROM imed.medhack_patient p
                 WHERE """ + " " + LAST_CHANGED + """
                 >= ?::timestamp
                 ORDER BY p.transactionnumber""", String.class, changedSince);
    }

    /** R3 — visits whose VISIT datetime falls inside the window (both ends included). */
    public List<String> visitIdsInPeriod(String from, String to) {
        return jdbc.queryForList("""
                SELECT p.transactionnumber FROM imed.medhack_patient p
                 WHERE """ + " " + VISIT_DT + """
                 >= ?::timestamp AND """ + " " + VISIT_DT + """
                 <= ?::timestamp
                 ORDER BY p.transactionnumber""", String.class, from, to);
    }

    // ---- R2 / R3: the case objects -----------------------------------------

    /**
     * Full case objects for the given visit ids, in id order. Ids the hospital
     * does not know are simply absent from the result — the caller reports them
     * as the contract's {@code not_found}.
     */
    public List<Map<String, Object>> cases(List<String> visitIds) {
        if (visitIds.isEmpty()) {
            return List.of();
        }
        Object[] ids = visitIds.toArray();
        String in = placeholders(visitIds.size());

        Map<String, List<Map<String, Object>>> documents = grouped("""
                SELECT transactionnumber,
                       documenttype   AS document_type,
                       fieldname      AS section_name,
                       value          AS text,
                       recorddatetime AS recorded_at
                  FROM imed.medhack_medicalrecord
                 WHERE transactionnumber IN """ + in, ids, "recorded_at");

        Map<String, List<Map<String, Object>>> recordResults = grouped("""
                SELECT transactionnumber,
                       name, tmlt, cgd,
                       documenttype   AS document_type,
                       fieldid        AS field_id,
                       fieldname      AS field_name,
                       subfieldname   AS subfield_name,
                       value,
                       uom            AS unit,
                       recorddatetime AS recorded_at
                  FROM imed.medhack_medicalrecord_result
                 WHERE transactionnumber IN """ + in, ids, "recorded_at");

        // is_cancelled filter: the /api/v1 DELETE is iMed's CANCEL flow, so
        // cancelled rows stay in the table for audit but must never be read
        // back (contract business rule 1).
        Map<String, List<Map<String, Object>>> diagnoses = grouped("""
                SELECT transactionnumber,
                       id            AS object_id,
                       icd           AS icd10_code,
                       name          AS description,
                       diagnosistype AS diagnosis_type,
                       updated_at
                  FROM imed.medhack_diagnosis_icd10
                 WHERE transactionnumber IN """ + in + """
                   AND is_cancelled IS DISTINCT FROM '1'""", ids, "updated_at");

        Map<String, List<Map<String, Object>>> procedures = grouped("""
                SELECT transactionnumber,
                       id            AS object_id,
                       icd           AS icd9_code,
                       name          AS description,
                       operationtype AS operation_type,
                       startdatetime AS operation_start,
                       enddatetime   AS operation_end,
                       updated_at
                  FROM imed.medhack_procedure_icd9
                 WHERE transactionnumber IN """ + in + """
                   AND is_cancelled IS DISTINCT FROM '1'""", ids,
                "operation_start", "operation_end", "updated_at");

        Map<String, List<Map<String, Object>>> drugOrders = grouped("""
                SELECT transactionnumber,
                       id                 AS object_id,
                       name,
                       itemid             AS item_id,
                       tmt                AS tmt_code,
                       dosagesignature    AS dosage_signature,
                       dosageinstruction  AS dosage_instruction,
                       quantity, remark,
                       receiveddatetime   AS received_at
                  FROM imed.medhack_orderdrug
                 WHERE transactionnumber IN """ + in, ids, "received_at");

        Map<String, List<Map<String, Object>>> labResults = grouped("""
                SELECT transactionnumber,
                       id              AS object_id,
                       panelname       AS panel_name,
                       paneltmlt       AS panel_tmlt,
                       panelcgd        AS panel_cgd,
                       itemid          AS item_id,
                       itemname        AS item_name,
                       itemtmlt        AS item_tmlt,
                       itemcgd         AS item_cgd,
                       itemvalue       AS value,
                       itemuom         AS unit,
                       collectdatetime AS collected_at,
                       reportdatetime  AS reported_at
                  FROM imed.medhack_orderlab
                 WHERE transactionnumber IN """ + in, ids, "collected_at", "reported_at");

        Map<String, List<Map<String, Object>>> vitals = grouped("""
                SELECT transactionnumber,
                       measuredatetime         AS measured_at,
                       temperature,
                       systolicbloodpressure   AS systolic,
                       diastolicbloodpressure  AS diastolic,
                       heartrate               AS heart_rate,
                       oxygensaturation        AS oxygen_saturation,
                       weight, height
                  FROM imed.medhack_vitalsign
                 WHERE transactionnumber IN """ + in, ids, "measured_at");

        Map<String, List<Map<String, Object>>> wardMovements = grouped("""
                SELECT transactionnumber,
                       department, ward,
                       bednumber     AS bed_number,
                       serviceid     AS service_id,
                       startdatetime AS start_at,
                       enddatetime   AS end_at
                  FROM imed.medhack_bedmanagement
                 WHERE transactionnumber IN """ + in, ids, "start_at", "end_at");

        Map<String, List<Map<String, Object>>> billingItems = grouped("""
                SELECT transactionnumber,
                       id          AS object_id,
                       name,
                       itemid      AS item_id,
                       tmlt, cgd,
                       feeschedule AS fee_schedule,
                       quantity, remark,
                       verifydatetime AS verified_at
                  FROM imed.medhack_billingitem
                 WHERE transactionnumber IN """ + in, ids, "verified_at");

        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> visit : visits(in, ids)) {
            String tn = (String) visit.get("visit_id");
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("visit", visit);
            c.put("documents", documents.getOrDefault(tn, List.of()));
            c.put("record_results", recordResults.getOrDefault(tn, List.of()));
            c.put("diagnoses", diagnoses.getOrDefault(tn, List.of()));
            c.put("procedures", procedures.getOrDefault(tn, List.of()));
            c.put("drug_orders", drugOrders.getOrDefault(tn, List.of()));
            c.put("lab_results", labResults.getOrDefault(tn, List.of()));
            c.put("vitals", vitals.getOrDefault(tn, List.of()));
            c.put("ward_movements", wardMovements.getOrDefault(tn, List.of()));
            c.put("billing_items", billingItems.getOrDefault(tn, List.of()));
            out.add(c);
        }
        return out;
    }

    /**
     * The visit block. encounter_type and last_changed_at are DERIVED, not
     * stored: the extract has no encounter-type column (IPD is "there is an
     * admission number"), and the contract leaves the change-timestamp
     * mechanism to the hospital, so it is computed from the visit datetime
     * and the code rows' write stamps rather than kept in a column.
     * department/ward come from the visit's latest bed-management row.
     */
    private List<Map<String, Object>> visits(String in, Object[] ids) {
        return jdbc.query("""
                SELECT p.transactionnumber, p.admissionnumber, p.sex, p.birthdate, p.ageyear,
                       p.ispregnant, p.admissiondatetime, p.dischargedatetime, p.dischargetype,
                       p.dischargestatus, p.healthcoverage, p.coding_status,
                       b.department, b.ward,
                       to_char(""" + " " + LAST_CHANGED + """
                       , 'YYYY-MM-DD"T"HH24:MI:SS') AS last_changed_at
                  FROM imed.medhack_patient p
                  LEFT JOIN LATERAL (
                       SELECT m.department, m.ward FROM imed.medhack_bedmanagement m
                        WHERE m.transactionnumber = p.transactionnumber
                        ORDER BY m.startdatetime DESC NULLS LAST LIMIT 1) b ON true
                 WHERE p.transactionnumber IN """ + in + """
                 ORDER BY p.transactionnumber""", (rs, i) -> {
            String admissionNumber = text(rs, "admissionnumber");
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("visit_id", text(rs, "transactionnumber"));
            v.put("admission_number", admissionNumber);
            v.put("encounter_type", admissionNumber == null ? "OPD" : "IPD");
            v.put("sex", text(rs, "sex"));
            v.put("birth_date", dateOnly(text(rs, "birthdate")));
            v.put("age_year", ageYears(text(rs, "ageyear")));
            v.put("is_pregnant", flag(text(rs, "ispregnant")));
            v.put("admission_datetime", iso(text(rs, "admissiondatetime")));
            v.put("discharge_datetime", iso(text(rs, "dischargedatetime")));
            v.put("discharge_type", text(rs, "dischargetype"));
            v.put("discharge_status", text(rs, "dischargestatus"));
            v.put("health_coverage", text(rs, "healthcoverage"));
            v.put("department", text(rs, "department"));
            v.put("ward", text(rs, "ward"));
            v.put("coding_status", text(rs, "coding_status"));
            v.put("last_changed_at", text(rs, "last_changed_at"));
            return v;
        }, ids);
    }

    // ---- R4 / R5: the code catalogues --------------------------------------

    /**
     * The hospital's own ICD master list. {@code edition} is in the contract as
     * "if available" and the extract has no such column, so it is served as
     * null rather than omitted (missing values are null, not absent keys).
     */
    public List<Map<String, Object>> catalog(String table) {
        return jdbc.query("SELECT code, description FROM imed." + table + " ORDER BY code",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("code", text(rs, "code"));
                    m.put("description", text(rs, "description"));
                    m.put("edition", null);
                    return m;
                });
    }

    // ---- helpers ------------------------------------------------------------

    /**
     * Runs one block query for the whole batch and groups the rows by visit.
     * {@code dateColumns} names the columns to normalize to ISO 8601; the first
     * of them (when present) also orders the block, which is what every
     * consumer wants — notes, labs and vitals read chronologically.
     */
    private Map<String, List<Map<String, Object>>> grouped(String sql, Object[] ids,
                                                           String... dateColumns) {
        RowMapper<Map<String, Object>> mapper = (rs, i) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            int columns = rs.getMetaData().getColumnCount();
            for (int c = 1; c <= columns; c++) {
                String name = rs.getMetaData().getColumnLabel(c);
                if ("transactionnumber".equals(name)) {
                    continue; // the grouping key, not part of the block's shape
                }
                String value = blankToNull(rs.getString(c));
                row.put(name, isDateColumn(name, dateColumns) ? iso(value) : value);
            }
            return row;
        };
        Map<String, List<Map<String, Object>>> byVisit = new LinkedHashMap<>();
        jdbc.query(sql, rs -> {
            String tn = rs.getString("transactionnumber");
            byVisit.computeIfAbsent(tn, k -> new ArrayList<>())
                    .add(mapper.mapRow(rs, 0));
        }, ids);
        if (dateColumns.length > 0) {
            String order = dateColumns[0];
            byVisit.values().forEach(rows -> rows.sort((a, b) -> {
                Object x = a.get(order);
                Object y = b.get(order);
                if (x == null || y == null) {
                    return x == null ? (y == null ? 0 : 1) : -1; // nulls last
                }
                return ((String) x).compareTo((String) y);
            }));
        }
        return byVisit;
    }

    private static boolean isDateColumn(String name, String[] dateColumns) {
        for (String d : dateColumns) {
            if (d.equals(name)) {
                return true;
            }
        }
        return false;
    }

    private static String placeholders(int n) {
        return "(" + "?, ".repeat(n - 1) + "?)";
    }

    private static String text(ResultSet rs, String column) throws SQLException {
        return blankToNull(rs.getString(column));
    }

    /** The extract writes "nothing" as both NULL and ''; the contract has only null. */
    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }

    /**
     * ISO 8601 for the wire. The extract stores "2026-04-01 06:45:00"; anything
     * that doesn't look like a date is passed through untouched rather than
     * dropped — losing an unexpected value would be worse than serving it.
     */
    private static String iso(String v) {
        if (v == null) {
            return null;
        }
        return v.length() >= 11 && v.charAt(4) == '-' && v.charAt(10) == ' '
                ? v.substring(0, 10) + "T" + v.substring(11)
                : v;
    }

    /**
     * birth_date is a DATE on the wire ("1961-01-19"), but the extract stores it
     * as a timestamp with a midnight time part. Anything that isn't a plain
     * leading date is left alone.
     */
    private static String dateOnly(String v) {
        if (v == null || v.length() < 10 || v.charAt(4) != '-' || v.charAt(7) != '-') {
            return v;
        }
        return v.substring(0, 10);
    }

    /** age_year is a number on the wire; the extract stores "70,2,9" (y,m,d). */
    private static Integer ageYears(String v) {
        if (v == null) {
            return null;
        }
        String years = v.split(",")[0].trim();
        try {
            return Integer.valueOf(years);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** is_pregnant is a boolean on the wire; the extract stores text or nothing. */
    private static Boolean flag(String v) {
        if (v == null) {
            return null;
        }
        return "1".equals(v) || "true".equalsIgnoreCase(v) || "Y".equalsIgnoreCase(v);
    }
}
