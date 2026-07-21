package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

/**
 * MedCode-AI-side write SQL for the approval workflow: users, case_codes,
 * icd_codes, coding_history, cases.case_status. Ported from server/app.py and
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

    // app.py:158 — icd_codes lookup by (code, system)
    public Integer findIcdCodeId(String code, String codeSystem) {
        List<Integer> r = jdbc.queryForList(
                "SELECT icd_code_id FROM icd_codes WHERE code=? AND code_system=?",
                Integer.class, code, codeSystem);
        return r.isEmpty() ? null : r.get(0);
    }

    // app.py:165 — create the icd_codes row on first use
    public Integer insertIcdCode(String code, String codeSystem, String description) {
        return jdbc.queryForObject(
                "INSERT INTO icd_codes (code, code_system, description) VALUES (?,?,?) RETURNING icd_code_id",
                Integer.class, code, codeSystem, description);
    }

    // app.py:179 / writeback.py:63 — one coder-assigned (or re-confirmed) code row
    public void insertCaseCode(String caseId, int icdCodeId, String role, String source,
                               String imedRefId, Integer assignedBy, String assignedAt) {
        jdbc.update("""
                INSERT INTO case_codes (case_id, icd_code_id, code_role, source, imed_ref_id, assigned_by, assigned_at)
                VALUES (?,?,?,?,?,?,?)""",
                caseId, icdCodeId, role, source, imedRefId, assignedBy, assignedAt);
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

    // writeback.py:56 — the imported principal diagnosis to re-confirm
    public Map<String, Object> findImportedPrincipal(String caseId) {
        List<Map<String, Object>> r = jdbc.query("""
                SELECT icd_code_id, code_role::text AS code_role FROM case_codes
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
                SELECT cc.case_code_id, cc.code_role::text AS code_role, ic.code,
                       ic.code_system::text AS code_system, ic.description
                FROM case_codes cc JOIN icd_codes ic ON ic.icd_code_id = cc.icd_code_id
                WHERE cc.case_id = ? AND cc.source = 'coder_assigned'""", CasesRepository.ROW, caseId);
    }
}
