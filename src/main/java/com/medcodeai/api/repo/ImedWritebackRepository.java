package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * The LIMITED iMed write-back (imed schema): on finalization exactly two
 * things are written — the A11 coding-status row and the finalized ICD codes
 * as NEW rows prefixed 'MCAI-'. Clinical notes are NEVER touched; codes
 * imported from iMed are never re-written (Q9). Ported from
 * sync/writeback.py:86-119 and app.py reopen_case_rows(). The 'MCAI-%'
 * literal is safe inline in JDBC (the bound-parameter trick in the Python was
 * a psycopg2-ism — do not port it).
 */
@Repository
public class ImedWritebackRepository {

    private final JdbcTemplate jdbc;

    public ImedWritebackRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // writeback.py:87 — A11 upsert-by-delete, half 1
    public void deleteCodingStatus(String tn) {
        jdbc.update("DELETE FROM imed.medhack_casecodingstatus WHERE transactionnumber = ?", tn);
    }

    // writeback.py:88 — A11 upsert-by-delete, half 2 (audit_status stays NULL)
    public void insertCodingStatus(String tn, String codingStatus, String finalizedAt, String updatedBy) {
        jdbc.update("""
                INSERT INTO imed.medhack_casecodingstatus
                (transactionnumber, coding_status, audit_status, finalized_at, updated_by)
                VALUES (?,?,?,?,?)""",
                tn, codingStatus, null, finalizedAt, updatedBy);
    }

    // writeback.py:98 / app.py:344 — replace our own MCAI- rows, idempotent
    public void deleteMcaiCodeRows(String tn) {
        jdbc.update("DELETE FROM imed.medhack_diagnosis_icd10 WHERE transactionnumber=? AND id LIKE 'MCAI-%'", tn);
        jdbc.update("DELETE FROM imed.medhack_procedure_icd9 WHERE transactionnumber=? AND id LIKE 'MCAI-%'", tn);
    }

    // writeback.py:107 — ICD-9 / procedure rows
    public void insertProcedureRow(String tn, String encountertype, String ref, String name, String icd) {
        jdbc.update("""
                INSERT INTO imed.medhack_procedure_icd9
                (transactionnumber, encountertype, id, name, icd, startdatetime, enddatetime, operationtype)
                VALUES (?,?,?,?,?,?,?,?)""",
                tn, encountertype, ref, name, icd, null, null, null);
    }

    // writeback.py:113 — ICD-10 diagnosis rows with the reverse Q3 role mapping
    public void insertDiagnosisRow(String tn, String encountertype, String ref, String name,
                                   String icd, String diagnosistype) {
        jdbc.update("""
                INSERT INTO imed.medhack_diagnosis_icd10
                (transactionnumber, encountertype, id, name, icd, diagnosistype)
                VALUES (?,?,?,?,?,?)""",
                tn, encountertype, ref, name, icd, diagnosistype);
    }
}
