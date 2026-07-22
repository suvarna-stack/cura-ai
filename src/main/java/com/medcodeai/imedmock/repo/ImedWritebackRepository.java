package com.medcodeai.imedmock.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Write side of the hospital API — the LIMITED write-back MedCode AI performs
 * on case finalization: the A11 coding-status row and the finalized ICD codes
 * as NEW rows prefixed 'MCAI-'. Clinical notes are NEVER touched; codes
 * originally imported from iMed are never re-written (Q9).
 *
 * Moved verbatim from medcode-api (which now calls this app over HTTP instead
 * of running this SQL itself); originally ported from sync/writeback.py:86-119
 * and app.py reopen_case_rows(). The 'MCAI-%' literal is safe inline in JDBC
 * (the bound-parameter trick in the Python was a psycopg2-ism).
 */
@Repository
public class ImedWritebackRepository {

    private final JdbcTemplate jdbc;

    public ImedWritebackRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // A11 upsert-by-delete, half 1
    public void deleteCodingStatus(String tn) {
        jdbc.update("DELETE FROM imed.medhack_casecodingstatus WHERE transactionnumber = ?", tn);
    }

    // A11 upsert-by-delete, half 2 (audit_status stays NULL)
    public void insertCodingStatus(String tn, String codingStatus, String finalizedAt, String updatedBy) {
        jdbc.update("""
                INSERT INTO imed.medhack_casecodingstatus
                (transactionnumber, coding_status, audit_status, finalized_at, updated_by)
                VALUES (?,?,?,?,?)""",
                tn, codingStatus, null, finalizedAt, updatedBy);
    }

    // replace our own MCAI- rows, idempotent
    public void deleteMcaiCodeRows(String tn) {
        jdbc.update("DELETE FROM imed.medhack_diagnosis_icd10 WHERE transactionnumber=? AND id LIKE 'MCAI-%'", tn);
        jdbc.update("DELETE FROM imed.medhack_procedure_icd9 WHERE transactionnumber=? AND id LIKE 'MCAI-%'", tn);
    }

    // ICD-9 / procedure rows
    public void insertProcedureRow(String tn, String encountertype, String ref, String name, String icd) {
        jdbc.update("""
                INSERT INTO imed.medhack_procedure_icd9
                (transactionnumber, encountertype, id, name, icd, startdatetime, enddatetime, operationtype)
                VALUES (?,?,?,?,?,?,?,?)""",
                tn, encountertype, ref, name, icd, null, null, null);
    }

    // ICD-10 diagnosis rows; diagnosistype arrives already in iMed vocabulary
    // (PRIMARY_DIAGNOSIS / COMORBIDITY / OTHERS / EXTERNAL_CAUSE_OF_INJURY)
    public void insertDiagnosisRow(String tn, String encountertype, String ref, String name,
            String icd, String diagnosistype) {
        jdbc.update("""
                INSERT INTO imed.medhack_diagnosis_icd10
                (transactionnumber, encountertype, id, name, icd, diagnosistype)
                VALUES (?,?,?,?,?,?)""",
                tn, encountertype, ref, name, icd, diagnosistype);
    }
}
