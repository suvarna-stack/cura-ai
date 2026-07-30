package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

/**
 * MedCode-AI-side write SQL for the approval workflow: users, case_codes,
 * icd_10/icd_9, coding_history, cases.case_status. Ported from server/app.py and
 * sync/writeback.py (each method cites its source). INSERT ... RETURNING
 * instead of generated-key APIs, mirroring the Python (works identically on
 * pgjdbc).
 */
@Repository
public class CodingRepository {

    private final JdbcTemplate jdbc;

    public CodingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // writeback.py:30 ensure_demo_coder() — lookup half
    public Integer findUserId(String email) {
        List<Integer> r = jdbc.queryForList(
                "SELECT user_id FROM users WHERE email = ?", Integer.class, email);
        return r.isEmpty() ? null : r.get(0);
    }

    // writeback.py:39 ensure_demo_coder() — create half
    public Integer insertUser(String email, String fullName, String role) {
        return jdbc.queryForObject(
                "INSERT INTO users (email, full_name, role) VALUES (?,?,?) RETURNING user_id",
                Integer.class, email, fullName, role);
    }

    // app.py:146 materialize_code_edits() — replace, don't append
    public void deleteCoderAssigned(String caseId) {
        jdbc.update("DELETE FROM case_codes WHERE case_id=? AND source='coder_assigned'", caseId);
    }

    // app.py:158 — catalog lookup, now per-system (2026-07-28 split)
    public Integer findIcdCodeId(String code, String codeSystem) {
        List<Integer> r = IcdSystem.of(codeSystem) == IcdSystem.ICD_9
                ? jdbc.queryForList("SELECT icd_9_id FROM icd_9 WHERE code=?", Integer.class, code)
                : jdbc.queryForList("SELECT icd_10_id FROM icd_10 WHERE code=?", Integer.class, code);
        return r.isEmpty() ? null : r.get(0);
    }

    // app.py:165 — create the catalog row on first use
    public Integer insertIcdCode(String code, String codeSystem, String description) {
        return IcdSystem.of(codeSystem) == IcdSystem.ICD_9
                ? jdbc.queryForObject(
                        "INSERT INTO icd_9 (code, description) VALUES (?,?) RETURNING icd_9_id",
                        Integer.class, code, description)
                : jdbc.queryForObject(
                        "INSERT INTO icd_10 (code, description) VALUES (?,?) RETURNING icd_10_id",
                        Integer.class, code, description);
    }

    // app.py:179 / writeback.py:63 — one coder-assigned (or re-confirmed) code row.
    // The catalog id is only meaningful alongside its system: it selects which of
    // the two FK columns is filled, and a CHECK pins the other to null. The
    // operation window and type are only ever non-null on ICD-9 (procedure) rows.
    public void insertCaseCode(String caseId, String codeSystem, int icdCodeId, String role,
                               String source, String imedRefId, Integer assignedBy, String assignedAt,
                               String operationStart, String operationEnd, String operationType) {
        boolean nine = IcdSystem.of(codeSystem) == IcdSystem.ICD_9;
        jdbc.update("""
                INSERT INTO case_codes (case_id, icd_10_id, icd_9_id, code_role, source, imed_ref_id,
                                        assigned_by, assigned_at, operation_start, operation_end,
                                        operation_type)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                caseId, nine ? null : icdCodeId, nine ? icdCodeId : null,
                role, source, imedRefId, assignedBy, assignedAt,
                nine ? operationStart : null, nine ? operationEnd : null,
                nine ? operationType : null);
    }

    // app.py:185 / writeback.py:67,82,121 — audit-trail row (created_at = DB default)
    public void insertHistory(String caseId, Integer userId, String actionType, String detailJson) {
        jdbc.update(
                "INSERT INTO coding_history (case_id, user_id, action_type, action_detail) VALUES (?,?,?,?)",
                caseId, userId, actionType, detailJson);
    }

    // writeback.py:52 simulate_coder_assignment() — idempotency check
    public boolean hasCoderAssigned(String caseId) {
        return !jdbc.queryForList(
                "SELECT 1 FROM case_codes WHERE case_id = ? AND source = 'coder_assigned' LIMIT 1",
                caseId).isEmpty();
    }

    // writeback.py:56 — the imported principal diagnosis to re-confirm. Collapses
    // the two catalog columns back to an (id, system) pair for insertCaseCode.
    public Map<String, Object> findImportedPrincipal(String caseId) {
        List<Map<String, Object>> r = jdbc.query("""
                SELECT COALESCE(icd_10_id, icd_9_id) AS icd_code_id,
                       CASE WHEN icd_10_id IS NOT NULL THEN 'ICD-10' ELSE 'ICD-9' END AS code_system,
                       code_role::text AS code_role FROM case_codes
                WHERE case_id = ? AND source = 'imported_from_imed'
                AND code_role = 'principal_diagnosis' LIMIT 1""", CasesRepository.ROW, caseId);
        return r.isEmpty() ? null : r.get(0);
    }

    // writeback.py:81 — workflow status flip
    public void updateCaseStatus(String caseId, String status) {
        jdbc.update("UPDATE cases SET case_status = ? WHERE case_id = ?", status, caseId);
    }

    // writeback.py:74 — finalize only needs encountertype (and existence)
    public Map<String, Object> caseRowForFinalize(String caseId) {
        List<Map<String, Object>> r = jdbc.query(
                "SELECT case_id, encountertype FROM cases WHERE case_id = ?",
                CasesRepository.ROW, caseId);
        return r.isEmpty() ? null : r.get(0);
    }

    // app.py:415 demo_reset() — every currently-approved case
    public List<String> approvedCaseIds() {
        return jdbc.queryForList("SELECT case_id FROM cases WHERE case_status='approved'", String.class);
    }

    // writeback.py:100 — the coder_assigned set the write-back exports
    public List<Map<String, Object>> coderCodes(String caseId) {
        return jdbc.query("""
                SELECT cc.case_code_id, cc.code_role::text AS code_role,
                       COALESCE(t10.code, t9.code) AS code,
                       CASE WHEN cc.icd_10_id IS NOT NULL THEN 'ICD-10' ELSE 'ICD-9' END AS code_system,
                       COALESCE(t10.description, t9.description) AS description,
                       cc.operation_start, cc.operation_end, cc.operation_type
                FROM case_codes cc
                LEFT JOIN icd_10 t10 ON t10.icd_10_id = cc.icd_10_id
                LEFT JOIN icd_9  t9  ON t9.icd_9_id   = cc.icd_9_id
                WHERE cc.case_id = ? AND cc.source = 'coder_assigned'
                  AND (cc.icd_10_id IS NOT NULL OR cc.icd_9_id IS NOT NULL)""",
                CasesRepository.ROW, caseId);
    }
}
