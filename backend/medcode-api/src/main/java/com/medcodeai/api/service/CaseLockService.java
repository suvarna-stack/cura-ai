package com.medcodeai.api.service;

import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * One coder per case: whoever opens a case detail page holds its lock until
 * they leave, and everyone else sees "being worked on by X" instead of the
 * editor. Advisory at the UI level, enforced at the write level — save-codes,
 * approve and reopen refuse a case another coder currently holds.
 *
 * In-memory on purpose: this backend runs as exactly one instance (see the
 * compose file's replicas note — the cases cache and WriteGate already depend
 * on that), so a map is both correct and free of schema changes. Locks are
 * leases, not latches: the holder's page heartbeats to keep the lease alive,
 * and a lease not renewed within {@link #TTL} is expired — a closed laptop
 * never strands a case.
 */
@Service
public class CaseLockService {

    /** Lease renewal deadline. The UI heartbeats at 30s, so one missed
     *  heartbeat survives a hiccup and two missed ones free the case. */
    public static final Duration TTL = Duration.ofSeconds(90);

    public record Lock(String email, String name, Instant acquiredAt, Instant lastSeen) {}

    private final ConcurrentHashMap<String, Lock> locks = new ConcurrentHashMap<>();

    /**
     * Acquire or renew the lease on a case. Returns the resulting holder —
     * compare its email to the caller's to know whether the acquire won.
     * Re-acquiring your own case (second tab, heartbeat) always succeeds and
     * keeps the original acquiredAt.
     */
    public Lock acquire(String caseId, String email, String name) {
        Instant now = Instant.now();
        return locks.compute(caseId, (id, cur) -> {
            if (cur != null && !expired(cur) && !cur.email().equals(email)) {
                return cur;                       // stays with the other coder
            }
            Instant since = (cur != null && cur.email().equals(email) && !expired(cur))
                    ? cur.acquiredAt() : now;
            return new Lock(email, name, since, now);
        });
    }

    /** Release the lease if (and only if) the caller holds it. */
    public void release(String caseId, String email) {
        locks.computeIfPresent(caseId,
                (id, cur) -> cur.email().equals(email) ? null : cur);
    }

    /**
     * The live holder when someone OTHER than {@code email} holds the case;
     * null when the case is free, expired, or held by the caller themselves.
     * This is what the write endpoints check before touching a case.
     */
    public Lock heldByOther(String caseId, String email) {
        Lock cur = locks.get(caseId);
        return (cur == null || expired(cur) || cur.email().equals(email)) ? null : cur;
    }

    private boolean expired(Lock lock) {
        return lock.lastSeen().plus(TTL).isBefore(Instant.now());
    }
}
