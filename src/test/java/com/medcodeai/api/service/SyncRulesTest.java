package com.medcodeai.api.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pure-function checks for the ported sync derivation rules (no DB, no HTTP).
 * These are the [POC] rules from sync/sync.py — the parts most prone to subtle
 * porting drift.
 */
class SyncRulesTest {

    @Test
    void parseDtNormalizesFormats() {
        assertEquals("2026-04-01 06:45:00", SyncRules.parseDt("2026-04-01 06:45:00"));
        // Q5 missing-separator case
        assertEquals("2026-04-01 06:45:00", SyncRules.parseDt("2026-04-0106:45:00"));
        // date only → midnight; HH:MM → :00 appended
        assertEquals("2026-04-01 00:00:00", SyncRules.parseDt("2026-04-01"));
        assertEquals("2026-04-01 06:45:00", SyncRules.parseDt("2026-04-01 06:45"));
        assertNull(SyncRules.parseDt(null));
        assertNull(SyncRules.parseDt(""));
        assertNull(SyncRules.parseDt("not-a-date"));
    }

    @Test
    void coverageFamilyAndPayer() {
        assertEquals("UCS", SyncRules.coverageFamily("UCS_89_I"));
        assertEquals("OFC", SyncRules.coverageFamily("OFC_O3"));
        assertEquals("SELF_PAY", SyncRules.coverageFamily("Cashonly"));
        assertEquals("OTHER", SyncRules.coverageFamily("P1027")); // no underscore, not special
        assertEquals("NHSO", SyncRules.familyPayer("UCS"));
        assertEquals("SELF", SyncRules.familyPayer("SELF_PAY"));
        assertNull(SyncRules.familyPayer("OTHER"));
    }

    @Test
    void encounterTypeFromAdmissionNumber() {
        assertEquals("1", SyncRules.encounterType("690003026"));
        assertEquals("0", SyncRules.encounterType(""));
        assertEquals("0", SyncRules.encounterType("   "));
        assertEquals("0", SyncRules.encounterType(null));
    }

    @Test
    void severityBuckets() {
        assertEquals("low", SyncRules.severity(0));
        assertEquals("medium", SyncRules.severity(1));
        assertEquals("medium", SyncRules.severity(2));
        assertEquals("high", SyncRules.severity(3));
    }

    @Test
    void diseaseGroupByIcdChapter() {
        assertEquals("Cardiovascular", SyncRules.diseaseGroup("I50.0"));
        assertEquals("Respiratory", SyncRules.diseaseGroup("J18.9"));
        assertEquals("Ungrouped", SyncRules.diseaseGroup(null));
        assertEquals("Ungrouped", SyncRules.diseaseGroup(""));
    }

    @Test
    void missingCodesRule() {
        // 2026-08-05 rule: complete = the hospital data already carried both
        // code systems at sync time (≥1 ICD-10 diagnosis AND ≥1 ICD-9
        // procedure); anything less is the coding work this product queues up
        assertTrue(SyncRules.missingCodes(true, true).isEmpty());
        assertEquals(List.of("icd9"), SyncRules.missingCodes(true, false));
        assertEquals(List.of("icd10"), SyncRules.missingCodes(false, true));
        assertEquals(List.of("icd10", "icd9"), SyncRules.missingCodes(false, false));
    }

    @Test
    void chunkSplitsBySize() {
        assertTrue(SyncRules.chunk(null).isEmpty());
        assertTrue(SyncRules.chunk("").isEmpty());
        assertEquals(List.of("abc"), SyncRules.chunk("abc", 5));
        assertEquals(List.of("abcde", "fg"), SyncRules.chunk("abcdefg", 5));
    }
}
