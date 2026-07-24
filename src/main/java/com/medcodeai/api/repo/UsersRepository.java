package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

/**
 * All SQL for the `users` table beyond the approve-flow's ensure-coder helpers
 * (those stay in {@link CodingRepository}). Reads/writes the auth + account
 * fields: password_hash, role, status, last_login_at.
 *
 * Conventions shared with {@link CasesRepository}: enum/timestamp columns are
 * ::text-cast so the driver returns wire text; rows come back through the
 * column-order-preserving {@link CasesRepository#ROW} mapper (numbers stay
 * numbers). The service layer shapes these raw rows into the API contract.
 *
 * Note the password_hash column is added at startup by SchemaBootstrap (the
 * frozen seed dump predates auth), so every SELECT that reads it assumes that
 * runner has already executed.
 */
@Repository
public class UsersRepository {

    private final JdbcTemplate jdbc;

    public UsersRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // created_at defaults to now() (microsecond precision); date_trunc to seconds
    // so the wire text matches the contract's "YYYY-MM-DD HH:MM:SS". last_login_at
    // is already second-precision (written via nowStr()), trunc'd too for uniformity.
    private static final String ACCOUNT_COLS = """
            user_id, full_name, email, role::text AS role, status::text AS status,
            date_trunc('second', created_at)::text AS created_at,
            date_trunc('second', last_login_at)::text AS last_login_at""";

    /** Every account, name order (never ORDER BY the bare role/status enum). */
    public List<Map<String, Object>> listAll() {
        return jdbc.query(
                "SELECT " + ACCOUNT_COLS + " FROM users ORDER BY full_name, user_id",
                CasesRepository.ROW);
    }

    /** Account row for responses (no password_hash), or null. */
    public Map<String, Object> findById(int userId) {
        List<Map<String, Object>> r = jdbc.query(
                "SELECT " + ACCOUNT_COLS + " FROM users WHERE user_id = ?",
                CasesRepository.ROW, userId);
        return r.isEmpty() ? null : r.get(0);
    }

    /** Login lookup — includes password_hash. Null when the email is unknown. */
    public Map<String, Object> findForLogin(String email) {
        List<Map<String, Object>> r = jdbc.query("""
                SELECT user_id, email, full_name, role::text AS role,
                       status::text AS status, password_hash
                FROM users WHERE email = ?""", CasesRepository.ROW, email);
        return r.isEmpty() ? null : r.get(0);
    }

    /** Create an account; RETURNING the new id (mirrors CodingRepository style). */
    public int insert(String email, String fullName, String role, String status, String passwordHash) {
        Integer id = jdbc.queryForObject("""
                INSERT INTO users (email, full_name, role, status, password_hash)
                VALUES (?,?,?,?,?) RETURNING user_id""",
                Integer.class, email, fullName, role, status, passwordHash);
        return id == null ? 0 : id;
    }

    public void updateProfile(int userId, String email, String fullName, String role) {
        jdbc.update("UPDATE users SET email=?, full_name=?, role=? WHERE user_id=?",
                email, fullName, role, userId);
    }

    public void updatePassword(int userId, String passwordHash) {
        jdbc.update("UPDATE users SET password_hash=? WHERE user_id=?", passwordHash, userId);
    }

    public void updateStatus(int userId, String status) {
        jdbc.update("UPDATE users SET status=? WHERE user_id=?", status, userId);
    }

    /** Stamp last_login_at on a successful login (nowStr text, cast by the driver). */
    public void updateLastLogin(int userId, String now) {
        jdbc.update("UPDATE users SET last_login_at=? WHERE user_id=?", now, userId);
    }

    public void delete(int userId) {
        jdbc.update("DELETE FROM users WHERE user_id=?", userId);
    }

    /**
     * True when the account is referenced by coding work (case_codes.assigned_by,
     * coding_history.user_id, knowledge_base.taught_by). Such accounts must not be
     * hard-deleted — the audit trail would break the FK — so the service returns a
     * 409 and the admin deactivates instead. (auth_sessions rows are handled
     * separately: they're the account's own sessions and get removed on delete.)
     */
    public boolean hasCodingRefs(int userId) {
        Boolean has = jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM case_codes WHERE assigned_by = ?
                    UNION ALL SELECT 1 FROM coding_history WHERE user_id = ?
                    UNION ALL SELECT 1 FROM knowledge_base WHERE taught_by = ?
                )""", Boolean.class, userId, userId, userId);
        return Boolean.TRUE.equals(has);
    }

    // ---- dashboard counts ----

    public long countCoders() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE role = 'coder'", Long.class);
        return n == null ? 0 : n;
    }

    /** Accounts whose last successful login was today (local date). */
    public long countActiveToday() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM users WHERE last_login_at::date = CURRENT_DATE", Long.class);
        return n == null ? 0 : n;
    }
}
