package com.medcodeai.api.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A star belongs to the coder who left it (hospital request 2026-08-25):
 * everyone SEES it — that is the whole feature — but only its author may take
 * it down, because a message anyone can delete is not one the writer can rely
 * on.
 *
 * The decision is pure — the stored stamp plus the caller's — so it is tested
 * here without a database or a token. What CaseStarService adds around it is
 * only the lookup that produces the stamp.
 */
class CaseStarOwnershipTest {

    @Test
    void theCoderWhoStarredItMayClearIt() {
        assertTrue(CaseStarService.mayManage("somchai@h.test", "somchai@h.test"));
    }

    @Test
    void anotherCoderMayNot() {
        assertFalse(CaseStarService.mayManage("somchai@h.test", "nok@h.test"));
    }

    @Test
    void anotherCoderMayNotRestarItEither() {
        // Re-starting writes a new owner, so allowing it would hand the star
        // over and let the taker clear it on the very next click — the same
        // call guards both verbs.
        assertFalse(CaseStarService.mayManage("somchai@h.test", "nok@h.test"));
    }

    @Test
    void anUnstarredCaseIsFreeForAnyone() {
        assertTrue(CaseStarService.mayManage(null, "nok@h.test"));
    }

    @Test
    void aStarWithNoOwnerRecordedIsFreeToo() {
        // Rows written before stamps existed would otherwise be unclearable.
        assertTrue(CaseStarService.mayManage("", "nok@h.test"));
        assertTrue(CaseStarService.mayManage("   ", "nok@h.test"));
    }

    @Test
    void theStampIsMatchedCaseInsensitively() {
        // Logins are not case-sensitive; a star must not become unclearable
        // because the coder typed their email differently one morning.
        assertTrue(CaseStarService.mayManage("Somchai@H.test", "somchai@h.test"));
    }

    @Test
    void twoCodersSharingADisplayNameStayApart() {
        // Exactly what matching on the account rather than the printed name
        // buys: the badge says "Somchai P." for both, the star is one's own.
        assertFalse(CaseStarService.mayManage("somchai@h.test", "somchai2@h.test"));
    }
}
