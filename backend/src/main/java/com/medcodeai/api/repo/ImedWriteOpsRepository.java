package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

/**
 * The revert journal for hospital writes. Every row the diff write-back
 * touches at the hospital (created / updated / cancelled) is recorded here
 * with its before-image, so reopen can restore the hospital to its
 * pre-approve state — the real iMed API has no "undo", only the same
 * POST/PUT/DELETE we build the revert plan from.
 *
 * First-op-wins: repeated approvals accumulate ops, but only the EARLIEST op
 * per hospital object_id matters on reopen (it carries the true original).
 * insertOp enforces that by skipping when the object already has one.
 * Cleared per case after a successful reopen revert.
 */
@Repository
public class ImedWriteOpsRepository {

    private final JdbcTemplate jdbc;

    public ImedWriteOpsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Records one hospital write; no-op if the object already has an entry
     *  (first-op-wins — the earliest before-image is the true original). */
    public void insertOp(String caseId, String op, String codeKind, String objectId,
            String beforeJson, String at) {
        jdbc.update("""
                INSERT INTO imed_write_ops (case_id, op, code_kind, object_id, before_json, created_at)
                SELECT ?,?,?,?,?,?
                WHERE NOT EXISTS (
                    SELECT 1 FROM imed_write_ops WHERE case_id = ? AND object_id = ?)""",
                caseId, op, codeKind, objectId, beforeJson, at, caseId, objectId);
    }

    /** All ops for a case, oldest first (op_id order = write order). */
    public List<Map<String, Object>> opsForCase(String caseId) {
        return jdbc.query("""
                SELECT op_id, op, code_kind, object_id, before_json
                FROM imed_write_ops WHERE case_id = ? ORDER BY op_id""",
                CasesRepository.ROW, caseId);
    }

    public void clearCase(String caseId) {
        jdbc.update("DELETE FROM imed_write_ops WHERE case_id = ?", caseId);
    }
}
