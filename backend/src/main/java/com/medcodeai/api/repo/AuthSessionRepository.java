package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

/**
 * SQL for the `auth_sessions` table (server-side Bearer sessions).
 *
 * session_id holds sha256hex(token) — the raw token is never persisted, so a DB
 * leak can't be replayed. refresh_token_enc stays null (no refresh-token flow).
 * Timestamps are compared against LOCALTIMESTAMP, which matches the column's
 * `timestamp without time zone` type (avoids a tz-coercion surprise vs now()).
 */
@Repository
public class AuthSessionRepository {

    private final JdbcTemplate jdbc;

    public AuthSessionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Open a session. `expiresAt` is nowStr-form text; the driver casts it. */
    public void insert(String sessionId, int userId, String expiresAt) {
        jdbc.update("""
                INSERT INTO auth_sessions (session_id, user_id, expires_at, revoked)
                VALUES (?,?,?,false)""", sessionId, userId, expiresAt);
    }

    /**
     * The live session joined to its user, or null. Enforces not-revoked,
     * not-expired, and an active account — a deactivated user's token stops
     * working immediately.
     */
    public Map<String, Object> findValid(String sessionId) {
        List<Map<String, Object>> r = jdbc.query("""
                SELECT u.user_id, u.email, u.full_name, u.role::text AS role
                FROM auth_sessions s JOIN users u ON u.user_id = s.user_id
                WHERE s.session_id = ? AND s.revoked = false
                  AND s.expires_at > LOCALTIMESTAMP AND u.status = 'active'""",
                CasesRepository.ROW, sessionId);
        return r.isEmpty() ? null : r.get(0);
    }

    /** Logout — revoke a single session. */
    public void revoke(String sessionId) {
        jdbc.update("UPDATE auth_sessions SET revoked = true WHERE session_id = ?", sessionId);
    }

    /** Deactivation — kill all of a user's live sessions. */
    public void revokeAllForUser(int userId) {
        jdbc.update("UPDATE auth_sessions SET revoked = true WHERE user_id = ?", userId);
    }

    /** Hard-delete a user's sessions (before deleting the user — FK would block). */
    public void deleteForUser(int userId) {
        jdbc.update("DELETE FROM auth_sessions WHERE user_id = ?", userId);
    }
}
