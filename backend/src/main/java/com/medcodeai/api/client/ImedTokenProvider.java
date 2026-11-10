package com.medcodeai.api.client;

import java.time.Clock;
import java.time.Instant;
import java.util.function.Supplier;

/**
 * The hospital API's access token, per its Medihack API guide (4 Nov 2026):
 * a client-credentials token from {@code POST /auth/token} that expires after
 * {@code expires_in} seconds (300 in the guide's example — "ให้ยึด expires_in
 * ที่ได้รับจริง", so the real value always wins).
 *
 * Fetched lazily on first use, reused until shortly before it expires, then
 * fetched again — so no call ever goes out with a token about to lapse in
 * flight. {@link #invalidate} drops a token the server refused (revoked
 * early, or the server restarted and forgot it), and the next
 * {@link #current} fetches a fresh one.
 *
 * Pure apart from the injected fetcher and clock, so the refresh timing is
 * unit-tested without a server (ImedTokenProviderTest). Thread-safe: one
 * instance is shared by every request the single medcode-api process makes.
 */
final class ImedTokenProvider {

    /** What the token endpoint answered; expiresInSeconds ≤ 0 means "not said". */
    record Token(String value, long expiresInSeconds) {
    }

    /** Assumed lifetime when the server sends no usable expires_in — the guide's example. */
    static final long DEFAULT_TTL_SECONDS = 300;

    private final Supplier<Token> fetcher;
    private final Clock clock;

    private String token;
    private Instant refreshAt;

    ImedTokenProvider(Supplier<Token> fetcher, Clock clock) {
        this.fetcher = fetcher;
        this.clock = clock;
    }

    /** A token that is still good for at least the refresh margin. */
    synchronized String current() {
        Instant now = clock.instant();
        if (token == null || !now.isBefore(refreshAt)) {
            Token t = fetcher.get();
            long ttl = t.expiresInSeconds() > 0 ? t.expiresInSeconds() : DEFAULT_TTL_SECONDS;
            token = t.value();
            refreshAt = now.plusSeconds(ttl - refreshMargin(ttl));
        }
        return token;
    }

    /**
     * Forget {@code rejected} if it is still the cached token. Comparing first
     * keeps a slow request that failed with an OLD token from throwing away the
     * fresh one another thread already fetched.
     */
    synchronized void invalidate(String rejected) {
        if (rejected != null && rejected.equals(token)) {
            token = null;
        }
    }

    /** Renew this long before expiry: 30s for the usual 300s token, a tenth of a short one. */
    static long refreshMargin(long ttlSeconds) {
        return Math.min(30, ttlSeconds / 10);
    }
}
