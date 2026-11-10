package com.medcodeai.imedmock.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * SQL for the real-shaped /api/v1 write API. The extract tables double as the
 * storage: a row created through POST /api/v1/diagnosis is immediately visible
 * through the extract READ endpoints (minus cancelled rows) — exactly how the
 * real hospital works, where the extract is a projection of the tables this
 * API writes.
 *
 * Fields the API accepts but the extract does not carry (coder_eid,
 * fix_dx_source, is_from) are not stored in the code tables — the response
 * lands in imed_request_log under its request_id, and the extract shape stays
 * what the hospital documented. Cancel = is_cancelled '1', never DELETE
 * (the real iMed cancel flow keeps the row for the audit trail).
 */
@Repository
public class ImedApiV1Repository {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final JdbcTemplate jdbc;

    public ImedApiV1Repository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Change stamp for the code tables — feeds the list endpoint's changed_since filter. */
    private static String now() {
        return LocalDateTime.now().format(TS);
    }

    // ---- request_id dedup ---------------------------------------------------

    /** The stored response for a replayed request_id, or null when first seen. */
    public String findLoggedResponse(String requestId) {
        List<String> r = jdbc.queryForList(
                "SELECT response FROM imed.imed_request_log WHERE request_id = ?", String.class, requestId);
        return r.isEmpty() ? null : r.get(0);
    }

    public void logRequest(String requestId, String endpoint, String responseJson) {
        jdbc.update("""
                INSERT INTO imed.imed_request_log (request_id, endpoint, response, created_at)
                VALUES (?,?,?,?) ON CONFLICT (request_id) DO NOTHING""",
                requestId, endpoint, responseJson, LocalDateTime.now().format(TS));
    }

    // ---- ICD-10 diagnosis rows ---------------------------------------------

    /** 409 guard: a live (non-cancelled) row with this code already on the visit. */
    public boolean icd10CodeExists(String tn, String icd10Code) {
        return !jdbc.queryForList("""
                SELECT 1 FROM imed.medhack_diagnosis_icd10
                WHERE transactionnumber = ? AND icd = ? AND is_cancelled IS DISTINCT FROM '1'
                LIMIT 1""", tn, icd10Code).isEmpty();
    }

    public void insertIcd10(String tn, String encountertype, String objectId, String name,
            String icd, String diagnosistype) {
        jdbc.update("""
                INSERT INTO imed.medhack_diagnosis_icd10
                (transactionnumber, encountertype, id, name, icd, diagnosistype, is_cancelled, updated_at)
                VALUES (?,?,?,?,?,?,NULL,?)""",
                tn, encountertype, objectId, name, icd, diagnosistype, now());
    }

    /** Updates only the provided (non-null) fields; 0 rows = unknown object_id. */
    public int updateIcd10(String tn, String objectId, String name, String icd, String diagnosistype) {
        return jdbc.update("""
                UPDATE imed.medhack_diagnosis_icd10
                SET name = COALESCE(?, name), icd = COALESCE(?, icd),
                    diagnosistype = COALESCE(?, diagnosistype), updated_at = ?
                WHERE transactionnumber = ? AND id = ? AND is_cancelled IS DISTINCT FROM '1'""",
                name, icd, diagnosistype, now(), tn, objectId);
    }

    public int cancelIcd10(String tn, String objectId) {
        return jdbc.update("""
                UPDATE imed.medhack_diagnosis_icd10 SET is_cancelled = '1', updated_at = ?
                WHERE transactionnumber = ? AND id = ?""", now(), tn, objectId);
    }

    // ---- ICD-9 procedure rows ----------------------------------------------

    public void insertIcd9(String tn, String encountertype, String objectId, String name,
            String icd, String startdatetime, String enddatetime, String operationtype) {
        jdbc.update("""
                INSERT INTO imed.medhack_procedure_icd9
                (transactionnumber, encountertype, id, name, icd, startdatetime, enddatetime,
                 operationtype, is_cancelled, updated_at)
                VALUES (?,?,?,?,?,?,?,?,NULL,?)""",
                tn, encountertype, objectId, name, icd, startdatetime, enddatetime, operationtype, now());
    }

    public int updateIcd9(String tn, String objectId, String name, String icd,
            String startdatetime, String enddatetime, String operationtype) {
        return jdbc.update("""
                UPDATE imed.medhack_procedure_icd9
                SET name = COALESCE(?, name), icd = COALESCE(?, icd),
                    startdatetime = COALESCE(?, startdatetime),
                    enddatetime = COALESCE(?, enddatetime),
                    operationtype = COALESCE(?, operationtype), updated_at = ?
                WHERE transactionnumber = ? AND id = ? AND is_cancelled IS DISTINCT FROM '1'""",
                name, icd, startdatetime, enddatetime, operationtype, now(), tn, objectId);
    }

    /**
     * A live procedure row's stored start/end ("YYYY-MM-DD HH:MM:SS", or a bare
     * date, or null), or null when the row is unknown or cancelled. A PUT may
     * send time_in/time_out without the date (the guide allows it), so the
     * controller rebuilds the full value on the stored date.
     */
    public String[] procedureWindow(String tn, String objectId) {
        List<String[]> r = jdbc.query("""
                SELECT startdatetime, enddatetime FROM imed.medhack_procedure_icd9
                WHERE transactionnumber = ? AND id = ? AND is_cancelled IS DISTINCT FROM '1'""",
                (rs, i) -> new String[]{rs.getString(1), rs.getString(2)}, tn, objectId);
        return r.isEmpty() ? null : r.get(0);
    }

    public int cancelIcd9(String tn, String objectId) {
        return jdbc.update("""
                UPDATE imed.medhack_procedure_icd9 SET is_cancelled = '1', updated_at = ?
                WHERE transactionnumber = ? AND id = ?""", now(), tn, objectId);
    }

    // ---- medical discharge --------------------------------------------------

    /** One discharge row per visit: replace-by-visit keeps POST retry-safe. */
    public void upsertDischargeOpd(String objectId, String tn, String statusId, String typeId, String note) {
        jdbc.update("DELETE FROM imed.doctor_discharge_opd WHERE transactionnumber = ?", tn);
        jdbc.update("""
                INSERT INTO imed.doctor_discharge_opd
                (object_id, transactionnumber, fix_opd_discharge_status_id,
                 base_doctor_discharge_type_id, note)
                VALUES (?,?,?,?,?)""", objectId, tn, statusId, typeId, note);
    }

    public void upsertDischargeIpd(String objectId, String tn, DiagnosisIpdFields f) {
        jdbc.update("DELETE FROM imed.doctor_discharge_ipd WHERE transactionnumber = ?", tn);
        jdbc.update("""
                INSERT INTO imed.doctor_discharge_ipd
                (object_id, transactionnumber, discharge_doctor_eid, fix_ipd_discharge_status_id,
                 fix_ipd_discharge_type_id, note, reason_admission, physical_examination, diagnostic,
                 investigation, hospital_course, treatment, plan_or_advice, discharge_instruction,
                 is_follow_up, is_from)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                objectId, tn, f.dischargeDoctorEid(), f.statusId(), f.typeId(), f.note(),
                f.reasonAdmission(), f.physicalExamination(), f.diagnostic(), f.investigation(),
                f.hospitalCourse(), f.treatment(), f.planOrAdvice(), f.dischargeInstruction(),
                f.isFollowUp(), f.isFrom());
    }

    // ---- coding status (medcode extension) ----------------------------------

    /**
     * The visit's coding workflow state on its own extract row —
     * medhack_patient.coding_status, written by MedCode AI's approve
     * ('approved') and reopen (cleared). Set ONLY when the caller sends the
     * field; the controller resolves the sent value first, so a plain NULL
     * here means "clear it" and reaches the column as such.
     *
     * Deliberately NOT dischargestatus: that column is the doctor's clinical
     * outcome, and the /api/v1 writes stopped touching it when this one
     * arrived (see db/migrations/0005_coding_status.sql).
     */
    public int updateCodingStatus(String tn, String codingStatus) {
        return jdbc.update("""
                UPDATE imed.medhack_patient SET coding_status = ?
                WHERE transactionnumber = ?""", codingStatus, tn);
    }

    /** Column bundle for the wide IPD discharge row (order = table order). */
    public record DiagnosisIpdFields(String dischargeDoctorEid, String statusId, String typeId,
            String note, String reasonAdmission, String physicalExamination, String diagnostic,
            String investigation, String hospitalCourse, String treatment, String planOrAdvice,
            String dischargeInstruction, String isFollowUp, String isFrom) {
    }

}
