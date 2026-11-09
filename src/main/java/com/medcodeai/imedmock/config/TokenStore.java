package com.medcodeai.imedmock.config;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The mock's token issuer, mirroring the hospital's Medihack API guide
 * ("คู่มือเชื่อมต่อ MedCode กับ Medihack API", 4 Nov 2026): a caller trades
 * its client_id/client_secret for a short-lived Bearer token at
 * {@code POST /auth/token} and sends that token on every /api/v1 call.
 *
 * Tokens are random opaque strings held in memory with an expiry — the real
 * API issues JWTs, but a caller never looks inside the token, so the mock
 * only has to get the lifecycle right: issued, accepted until it expires,
 * refused after. A restart forgets every token, which a well-behaved client
 * survives the same way it survives expiry (ask for a new one).
 *
 * Credentials and lifetime come from the environment, with defaults so local
 * dev and the test suite work out of the box:
 * IMED_CLIENT_ID / IMED_CLIENT_SECRET (medcode-mock-client / medcode-mock-secret)
 * and IMED_TOKEN_TTL_SECONDS (300, the guide's example lifetime).
 */
@Component
public class TokenStore {

    private final String clientId = envOr("IMED_CLIENT_ID", "medcode-mock-client");
    private final String clientSecret = envOr("IMED_CLIENT_SECRET", "medcode-mock-secret");
    private final Duration ttl = Duration.ofSeconds(
            Long.parseLong(envOr("IMED_TOKEN_TTL_SECONDS", "300")));

    private final Map<String, Instant> tokens = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    /** The lifetime every token gets — reported to the caller as expires_in. */
    public Duration ttl() {
        return ttl;
    }

    /** Constant-time check of the Basic-auth pair, so a timing probe learns nothing. */
    public boolean credentialsMatch(String id, String secret) {
        return id != null && secret != null
                && MessageDigest.isEqual(id.getBytes(StandardCharsets.UTF_8),
                        clientId.getBytes(StandardCharsets.UTF_8))
                && MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8),
                        clientSecret.getBytes(StandardCharsets.UTF_8));
    }

    /** A new token with the configured lifetime. */
    public String issue() {
        return issue(ttl);
    }

    /**
     * A new token that lives for {@code lifetime}. Public so the test suite can
     * mint an already-expired token instead of sleeping through a real one.
     * Expired tokens are swept on every issue, which keeps the map bounded by
     * the number of tokens alive at once.
     */
    public String issue(Duration lifetime) {
        Instant now = Instant.now();
        tokens.values().removeIf(expiry -> !expiry.isAfter(now));
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokens.put(token, now.plus(lifetime));
        return token;
    }

    /** True while the token is known and not yet expired. */
    public boolean isValid(String token) {
        Instant expiry = token == null ? null : tokens.get(token);
        return expiry != null && Instant.now().isBefore(expiry);
    }

    private static String envOr(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }
}
