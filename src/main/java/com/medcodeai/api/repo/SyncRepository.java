package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Write SQL for the inbound iMed → MedCode AI sync (SyncService). Ported from
 * sync/sync.py's INSERTs. Conventions shared with the rest of the repo layer:
 *  - plain strings go into ENUM/JSONB columns (stringtype=unspecified);
 *  - imported rows carry source='imported_from_imed' — the sync NEVER touches
 *    coder-owned rows (source='coder_assigned', working state, case_status);
 *  - refreshing an existing open case is delete-imported-then-reinsert, so a
 *    re-sync is idempotent.
 */
@Repository
public class SyncRepository {

    private final JdbcTemplate jdbc;

    public SyncRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Current workflow status, or null when the case is unknown to medcode. */
    public String caseStatus(String caseId) {
        List<String> r = jdbc.queryForList(
                "SELECT case_status::text FROM cases WHERE case_id=?", String.class, caseId);
        return r.isEmpty() ? null : r.get(0);
    }

    // sync.py:182 — new case row (case_status seeded 'open')
    public void insertCase(String caseId, String patientRef, String encountertype, String sex,
                           String birthdate, String ageyear, String admissiondatetime,
                           String dischargedatetime, String dischargetype, String dischargestatus,
                           String ispregnant, String ward, String department, String coverageType,
                           String completeness, String missingDetail, String diseaseGroup,
                           String severity, String fetchedAt) {
        jdbc.update("""
                INSERT INTO cases
                    (case_id, patient_ref, encountertype, sex, birthdate, ageyear,
                     admissiondatetime, dischargedatetime, dischargetype, dischargestatus,
                     ispregnant, ward, department, coverage_type,
                     completeness_status, missing_detail, disease_group, severity_level,
                     case_status, fetched_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?)""",
                caseId, patientRef, encountertype, sex, birthdate, ageyear,
                admissiondatetime, dischargedatetime, dischargetype, dischargestatus,
                ispregnant, ward, department, coverageType,
                completeness, missingDetail, diseaseGroup, severity, fetchedAt);
    }

    /**
     * Refresh the hospital-sourced columns of an EXISTING open case. case_status
     * is deliberately NOT touched (coder-owned); fetched_at moves to the sync time.
     */
    public void updateCaseClinical(String caseId, String patientRef, String encountertype, String sex,
                                   String birthdate, String ageyear, String admissiondatetime,
                                   String dischargedatetime, String dischargetype, String dischargestatus,
                                   String ispregnant, String ward, String department, String coverageType,
                                   String completeness, String missingDetail, String diseaseGroup,
                                   String severity, String fetchedAt) {
        jdbc.update("""
                UPDATE cases SET
                    patient_ref=?, encountertype=?, sex=?, birthdate=?, ageyear=?,
                    admissiondatetime=?, dischargedatetime=?, dischargetype=?, dischargestatus=?,
                    ispregnant=?, ward=?, department=?, coverage_type=?,
                    completeness_status=?, missing_detail=?, disease_group=?, severity_level=?,
                    fetched_at=?
                WHERE case_id=?""",
                patientRef, encountertype, sex, birthdate, ageyear,
                admissiondatetime, dischargedatetime, dischargetype, dischargestatus,
                ispregnant, ward, department, coverageType,
                completeness, missingDetail, diseaseGroup, severity, fetchedAt, caseId);
    }

    // sync.py:198 — one report section (READ, copied verbatim)
    public void insertSection(String caseId, String documenttype, String fieldname,
                              String value, String recorddatetime) {
        jdbc.update("""
                INSERT INTO case_report_sections (case_id, documenttype, fieldname, value, recorddatetime)
                VALUES (?,?,?,?,?)""", caseId, documenttype, fieldname, value, recorddatetime);
    }

    // sync.py:202 — one section chunk (CREATE, F11); embedding_ref null for now
    public void insertChunk(String caseId, String chunkText, int chunkIndex) {
        jdbc.update("""
                INSERT INTO document_chunks (case_id, chunk_text, chunk_index, embedding_ref)
                VALUES (?,?,?,NULL)""", caseId, chunkText, chunkIndex);
    }

    // sync.py:215 code_row() — imported code row; assigned_by/assigned_at keep
    // their DB defaults (this is not coder work)
    public void insertImportedCode(String caseId, String codeSystem, int icdCodeId,
                                   String role, String imedRefId) {
        boolean nine = IcdSystem.of(codeSystem) == IcdSystem.ICD_9;
        jdbc.update("""
                INSERT INTO case_codes (case_id, icd_10_id, icd_9_id, code_role, source, imed_ref_id)
                VALUES (?,?,?,?,'imported_from_imed',?)""",
                caseId, nine ? null : icdCodeId, nine ? icdCodeId : null, role, imedRefId);
    }

    // sync.py:224 order_row() — one order; order_detail is the raw hospital row as JSON
    public void insertOrder(String caseId, String category, String imedSource, String imedRefId,
                            String orderName, String orderDetailJson, String orderedAt) {
        jdbc.update("""
                INSERT INTO case_orders
                    (case_id, order_category, imed_source, imed_ref_id, order_name, order_detail, ordered_at)
                VALUES (?,?,?,?,?,?,?)""",
                caseId, category, imedSource, imedRefId, orderName, orderDetailJson, orderedAt);
    }

    // sync.py:111 load_coverage_types() — reference row from the hospital's own
    // coverage codes; idempotent (labels stay null until the hospital lists them).
    // Returns true when a NEW row was inserted.
    public boolean upsertCoverageType(String coverageCode, String schemeFamily, String payer) {
        return jdbc.update("""
                INSERT INTO coverage_types (coverage_code, scheme_family, label_th, label_en, payer)
                VALUES (?,?,NULL,NULL,?)
                ON CONFLICT (coverage_code) DO NOTHING""", coverageCode, schemeFamily, payer) > 0;
    }

    // ---- refresh: drop the hospital-sourced child rows before reinserting ----

    public void deleteSections(String caseId) {
        jdbc.update("DELETE FROM case_report_sections WHERE case_id=?", caseId);
    }

    public void deleteChunks(String caseId) {
        jdbc.update("DELETE FROM document_chunks WHERE case_id=?", caseId);
    }

    public void deleteOrders(String caseId) {
        jdbc.update("DELETE FROM case_orders WHERE case_id=?", caseId);
    }

    /** Imported codes ONLY — coder_assigned rows are never removed by a sync. */
    public void deleteImportedCodes(String caseId) {
        jdbc.update("DELETE FROM case_codes WHERE case_id=? AND source='imported_from_imed'", caseId);
    }
}
