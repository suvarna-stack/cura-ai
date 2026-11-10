package com.medcodeai.api.client;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Token lifecycle without a server: a fake fetcher counts token requests and
 * a hand-moved clock stands in for time passing.
 */
class ImedTokenProviderTest {

    /** A clock the test moves by hand. */
    private static final class MovableClock extends Clock {
        private Instant now = Instant.parse("2026-11-09T08:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }
    }

    private final MovableClock clock = new MovableClock();
    private final AtomicInteger fetches = new AtomicInteger();

    private ImedTokenProvider provider(long expiresIn) {
        return new ImedTokenProvider(
                () -> new ImedTokenProvider.Token("t" + fetches.incrementAndGet(), expiresIn), clock);
    }

    @Test
    void reusesTheTokenUntilShortlyBeforeItExpires() {
        ImedTokenProvider p = provider(300);
        assertEquals("t1", p.current());
        clock.advance(Duration.ofSeconds(269));
        assertEquals("t1", p.current(), "still 31s left — keep it");
        clock.advance(Duration.ofSeconds(1));
        assertEquals("t2", p.current(), "inside the 30s margin — renew before it can lapse in flight");
        assertEquals(2, fetches.get());
    }

    @Test
    void shortTokensRenewATenthEarly() {
        ImedTokenProvider p = provider(20);
        p.current();
        clock.advance(Duration.ofSeconds(17));
        assertEquals("t1", p.current());
        clock.advance(Duration.ofSeconds(1));
        assertEquals("t2", p.current(), "a 20s token renews 2s early, not 30s (that would be never)");
    }

    @Test
    void missingExpiresInFallsBackToTheGuidesFiveMinutes() {
        ImedTokenProvider p = provider(0);
        p.current();
        clock.advance(Duration.ofSeconds(269));
        assertEquals("t1", p.current());
        clock.advance(Duration.ofSeconds(1));
        assertEquals("t2", p.current());
    }

    @Test
    void invalidateDropsOnlyTheTokenThatWasRefused() {
        ImedTokenProvider p = provider(300);
        String first = p.current();
        p.invalidate(first);
        String second = p.current();
        assertEquals("t2", second, "a refused token is replaced on the next call");
        // a slow request that failed with the OLD token must not throw away the new one
        p.invalidate(first);
        assertEquals("t2", p.current());
        assertEquals(2, fetches.get());
    }
}
