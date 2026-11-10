package com.medcodeai.api.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * One coder per case: acquire/renew/release semantics of the in-memory lease
 * registry (no DB, no HTTP). Expiry is time-based (90s TTL) and covered by
 * the heartbeat design rather than a sleeping test.
 */
class CaseLockServiceTest {

    private final CaseLockService locks = new CaseLockService();

    @Test
    void firstCoderWinsSecondCoderSeesTheHolder() {
        var a = locks.acquire("690003026", "a@h.test", "Coder A");
        assertEquals("a@h.test", a.email());

        var b = locks.acquire("690003026", "b@h.test", "Coder B");
        assertEquals("a@h.test", b.email());     // stays with A
        assertEquals("Coder A", b.name());       // B is told who has it
    }

    @Test
    void reacquiringYourOwnCaseRenewsAndKeepsSince() {
        var first = locks.acquire("690003026", "a@h.test", "Coder A");
        var again = locks.acquire("690003026", "a@h.test", "Coder A");
        assertEquals("a@h.test", again.email());
        assertEquals(first.acquiredAt(), again.acquiredAt()); // lease renewed, not restarted
    }

    @Test
    void releaseFreesTheCaseForTheNextCoder() {
        locks.acquire("690003026", "a@h.test", "Coder A");
        locks.release("690003026", "a@h.test");
        var b = locks.acquire("690003026", "b@h.test", "Coder B");
        assertEquals("b@h.test", b.email());
    }

    @Test
    void releaseByNonHolderIsANoOp() {
        locks.acquire("690003026", "a@h.test", "Coder A");
        locks.release("690003026", "b@h.test");  // B never held it
        assertNotNull(locks.heldByOther("690003026", "b@h.test")); // still A's
    }

    @Test
    void heldByOtherIsNullForTheHolderAndForFreeCases() {
        assertNull(locks.heldByOther("690003026", "a@h.test"));    // free
        locks.acquire("690003026", "a@h.test", "Coder A");
        assertNull(locks.heldByOther("690003026", "a@h.test"));    // own lock
        var holder = locks.heldByOther("690003026", "b@h.test");   // other's lock
        assertNotNull(holder);
        assertEquals("Coder A", holder.name());
    }

    @Test
    void locksArePerCase() {
        locks.acquire("690003026", "a@h.test", "Coder A");
        var other = locks.acquire("690003027", "b@h.test", "Coder B");
        assertEquals("b@h.test", other.email());
    }
}
