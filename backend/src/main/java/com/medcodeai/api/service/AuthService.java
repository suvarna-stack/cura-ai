package com.medcodeai.api.service;

import com.medcodeai.api.repo.AuthSessionRepository;
import com.medcodeai.api.repo.UsersRepository;
import com.medcodeai.api.web.ApiExceptionHandler;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Login / logout / token validation for the admin surface.
 *
 * Sessions are stateful and stored in auth_sessions: on login we mint a random
 * opaque token, persist ONLY its sha256 hash (as session_id), and hand the raw
 * token back as the Bearer credential. Every guarded request re-hashes the
 * presented token and looks it up. Logout revokes the row.
 *
 * Login authenticates any active account with the right password — the admin
 * role is enforced separately, on the /api/admin/** routes, by AuthInterceptor.
 * That keeps coder login working out of the box for when the coder frontend
 * lands, while today only admins can reach the admin endpoints.
 */
@Service
public class AuthService {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String BAD_CREDS = "invalid email or password";

    private final UsersRepository users;
    private final AuthSessionRepository sessions;
    private final PasswordEncoder encoder;
    private final LoginRateLimiter rateLimiter;
    private final SecureRandom rng = new SecureRandom();
    private final int ttlDays;

    /** The authenticated caller, resolved from a Bearer token. */
    public record Principal(int userId, String email, String fullName, String role, String sessionId) {
    }

    public AuthService(UsersRepository users, AuthSessionRepository sessions, PasswordEncoder encoder,
                       LoginRateLimiter rateLimiter) {
        this.users = users;
        this.sessions = sessions;
        this.encoder = encoder;
        this.rateLimiter = rateLimiter;
        String ttl = System.getenv("SESSION_TTL_DAYS");
        this.ttlDays = ttl == null || ttl.isBlank() ? 7 : Integer.parseInt(ttl.strip());
    }

    /** Verify credentials, open a session, return {token, user{...}}. 401 on any
     *  failure; 429 once the rate limiter trips for this email. */
    public Map<String, Object> login(String email, String password) {
        rateLimiter.checkAllowed(email); // 429 if locked out (before we touch the DB)

        Map<String, Object> u = users.findForLogin(email);
        String hash = u == null ? null : (String) u.get("password_hash");
        // Uniform failure for unknown email / no-password / wrong password /
        // inactive — never leak which one it was.
        boolean ok = hash != null && !hash.isBlank() && encoder.matches(password, hash)
                && "active".equals(u.get("status"));
        if (!ok) {
            rateLimiter.recordFailure(email);
            throw new ApiExceptionHandler.UnauthorizedException(BAD_CREDS);
        }
        rateLimiter.reset(email); // clean slate on success

        int userId = ((Number) u.get("user_id")).intValue();
        String token = newToken();
        String expiresAt = LocalDateTime.now().plusDays(ttlDays).format(TS);
        sessions.insert(sha256hex(token), userId, expiresAt);
        users.updateLastLogin(userId, LocalDateTime.now().format(TS));

        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", userId);
        user.put("email", u.get("email"));
        user.put("fullName", u.get("full_name"));
        user.put("role", u.get("role"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", token);
        out.put("user", user);
        return out;
    }

    /** Resolve a Bearer token to its Principal, or null if not a live session. */
    public Principal authenticate(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String sid = sha256hex(token);
        Map<String, Object> row = sessions.findValid(sid);
        if (row == null) {
            return null;
        }
        return new Principal(((Number) row.get("user_id")).intValue(),
                (String) row.get("email"), (String) row.get("full_name"),
                (String) row.get("role"), sid);
    }

    public void logout(String sessionId) {
        sessions.revoke(sessionId);
    }

    private String newToken() {
        byte[] buf = new byte[32];
        rng.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    private static String sha256hex(String s) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // SHA-256 is always present
        }
    }
}
