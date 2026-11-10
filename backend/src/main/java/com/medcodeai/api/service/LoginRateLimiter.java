package com.medcodeai.api.service;

import com.medcodeai.api.web.ApiExceptionHandler;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A small in-memory brute-force guard for login: after too many failed attempts
 * for the same email within a window, further attempts (even a correct one) are
 * rejected with 429 until the window elapses. A successful login clears the
 * count.
 *
 * In-memory is authoritative here because the whole app runs as a single
 * instance (same assumption as WriteGate / CasesCache). Tunables (env):
 *   LOGIN_MAX_ATTEMPTS     default 5
 *   LOGIN_LOCKOUT_SECONDS  default 900 (15 min) — both the counting window and
 *                          the lockout length, measured from the first failure.
 *
 * Keyed by email (lowercased): the point is to stop guessing a known account's
 * password. Tradeoff: an attacker who knows an email can lock that account out
 * for the window — acceptable at this stage; revisit with per-IP limiting or a
 * CAPTCHA if it ever matters.
 */
@Component
public class LoginRateLimiter {

    private record Attempt(int count, long windowStartMs) {
    }

    private final ConcurrentHashMap<String, Attempt> attempts = new ConcurrentHashMap<>();
    private final int maxAttempts;
    private final long windowMs;

    public LoginRateLimiter() {
        this.maxAttempts = envInt("LOGIN_MAX_ATTEMPTS", 5);
        this.windowMs = envInt("LOGIN_LOCKOUT_SECONDS", 900) * 1000L;
    }

    /** Throw 429 if this email is currently locked out. Call before verifying. */
    public void checkAllowed(String email) {
        String key = key(email);
        Attempt a = attempts.get(key);
        if (a == null) {
            return;
        }
        if (now() - a.windowStartMs() > windowMs) {
            attempts.remove(key); // window elapsed — fresh start
            return;
        }
        if (a.count() >= maxAttempts) {
            throw new ApiExceptionHandler.TooManyRequestsException(
                    "too many failed login attempts — try again later");
        }
    }

    /** Record a failed attempt (starts/continues the current window). */
    public void recordFailure(String email) {
        String key = key(email);
        attempts.compute(key, (k, a) -> {
            long t = now();
            if (a == null || t - a.windowStartMs() > windowMs) {
                return new Attempt(1, t);
            }
            return new Attempt(a.count() + 1, a.windowStartMs());
        });
    }

    /** Clear the counter after a successful login. */
    public void reset(String email) {
        attempts.remove(key(email));
    }

    private static String key(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }

    private static long now() {
        return System.currentTimeMillis();
    }

    private static int envInt(String name, int fallback) {
        String v = System.getenv(name);
        if (v == null || v.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(v.strip());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
