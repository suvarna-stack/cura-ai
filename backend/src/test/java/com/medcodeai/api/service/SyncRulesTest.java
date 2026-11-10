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
    void parseDtStoresHospitalLocalTimeWhateverTheOffset() {
        // the hospital API's own form: its +07:00 is simply dropped
        assertEquals("2026-08-09 08:00:00", SyncRules.parseDt("2026-08-09T08:00:00+07:00"));
        assertEquals("2026-08-09 08:00:00", SyncRules.parseDt("2026-08-09T08:00:00.250+0700"));
        // any other offset is converted first, or the clock reading would be 7h off
        assertEquals("2026-08-09 08:00:00", SyncRules.parseDt("2026-08-09T01:00:00Z"));
        assertEquals("2026-08-10 00:30:00", SyncRules.parseDt("2026-08-09T17:30:00+00:00"));
        // a bare date stays midnight; no offset means already local
        assertEquals("2026-08-09 00:00:00", SyncRules.parseDt("2026-08-09"));
        assertEquals("2026-08-09 08:00:00", SyncRules.parseDt("2026-08-09T08:00:00"));
    }

    @Test
    void sexWordSpellsOutTheGuidesLetterCodes() {
        assertEquals("female", SyncRules.sexWord("F"));
        assertEquals("male", SyncRules.sexWord("m"));
        // the extract's (and every older sync's) words are already ours
        assertEquals("female", SyncRules.sexWord("female"));
        assertEquals("male", SyncRules.sexWord(" Male "));
        assertEquals("unknown", SyncRules.sexWord("unknown"));
        assertNull(SyncRules.sexWord(""));
        assertNull(SyncRules.sexWord(null));
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

    @Test
    void visitDateDecodesTheTransactionNumber() {
        // The only date an OPD visit has: YYMMDDHHMMSS at positions 4-15.
        // "870 260722091423 00201" -> 2026-07-22 09:14:23
        assertEquals("2026-07-22 09:14:23",
                SyncRules.visitDateFromCaseId("87026072209142300201"));
        // midnight must survive rather than collapse to a bare date
        assertEquals("2026-01-05 00:00:00",
                SyncRules.visitDateFromCaseId("87026010500000000201"));
        // the decode must agree with what parseDt() produces for the same
        // instant, because callers use the two interchangeably
        assertEquals(SyncRules.parseDt("2026-07-22T09:14:23"),
                SyncRules.visitDateFromCaseId("87026072209142300201"));
    }

    @Test
    void visitDateRefusesWhatItCannotDecode() {
        assertNull(SyncRules.visitDateFromCaseId(null));
        assertNull(SyncRules.visitDateFromCaseId(""));
        assertNull(SyncRules.visitDateFromCaseId("87026072209"));         // too short
        assertNull(SyncRules.visitDateFromCaseId("870abcdefghijkl0201")); // not digits
        assertNull(SyncRules.visitDateFromCaseId("87026133109142300201")); // month 13
        assertNull(SyncRules.visitDateFromCaseId("87026023009142300201")); // 30 Feb
        assertNull(SyncRules.visitDateFromCaseId("87026072299142300201")); // hour 99
    }
}
