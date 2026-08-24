package com.medcodeai.api.service;

import com.medcodeai.api.repo.CodingRepository;
import com.medcodeai.api.repo.WorkingStateRepository;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The both-columns approve rule — no DB, no HTTP.
 *
 * A case may only be finalized once BOTH halves are answered: a diagnosis AND
 * a procedure, or the coder's explicit "no procedure was performed". Approving
 * from the case LIST never opens the case, so nothing there can be ticked by
 * hand; the hospital's own codes and a lone prediction stand in for that
 * decision, but a real choice between candidates is left to the coder.
 */
class ApprovalGateTest {

    private static ApprovalService service(String payload, List<Map<String, Object>> imported) {
        WorkingStateRepository ws = new WorkingStateRepository(null) {
            @Override
            public String loadEditsPayload(String caseId) {
                return payload;
            }
        };
        CodingRepository coding = new CodingRepository(null) {
            @Override
            public List<Map<String, Object>> importedCodes(String caseId) {
                return imported;
            }
        };
        return new ApprovalService(null, coding, null, ws, null, null, null);
    }

    private static ApprovalService withPayload(String payload) {
        return service(payload, List.of());
    }

    private static Map<String, Object> importedRow(String system, String role) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("icd_code_id", 1);
        r.put("code_system", system);
        r.put("code_role", role);
        return r;
    }

    private static List<String> codesOf(ApprovalService.Picks p) {
        return p.entries().stream().map(e -> String.valueOf(e.get("code"))).toList();
    }

    @Test
    void bothColumnsTickedApproves() {
        var svc = withPayload("""
                [{"code":"K35.8","type":"ICD-10","selected":true},
                 {"code":"47.09","type":"ICD-9","selected":true}]""");
        var picks = svc.effectiveCodes("c1");
        assertTrue(svc.coversBothSystems(picks));
        assertEquals(List.of("K35.8", "47.09"), codesOf(picks));
    }

    @Test
    void aDiagnosisAloneIsNotAFinishedCase() {
        // the procedure code is there but the coder deliberately unticked it —
        // a rejection is a decision, and it is not quietly picked back up
        var svc = withPayload("""
                [{"code":"K35.8","type":"ICD-10","selected":true},
                 {"code":"47.09","type":"ICD-9","selected":false}]""");
        var picks = svc.effectiveCodes("c1");
        assertFalse(svc.coversBothSystems(picks));
        assertEquals(List.of("K35.8"), codesOf(picks));
    }

    @Test
    void aProcedureAloneIsNotAFinishedCaseEither() {
        var svc = withPayload("""
                [{"code":"K35.8","type":"ICD-10","selected":false},
                 {"code":"47.09","type":"ICD-9","selected":true}]""");
        assertFalse(svc.coversBothSystems(svc.effectiveCodes("c1")));
    }

    @Test
    void noProcedurePerformedAnswersTheProcedureColumn() {
        var svc = withPayload("""
                [{"code":"K35.8","type":"ICD-10","selected":true},
                 {"code":"","type":"ICD-9","noProcedure":true}]""");
        var picks = svc.effectiveCodes("c1");
        assertTrue(picks.noProcedure());
        assertTrue(svc.coversBothSystems(picks));
        assertEquals(List.of("K35.8"), codesOf(picks));   // the marker is not a code
    }

    @Test
    void aLonePredictionFillsAnUntouchedColumn() {
        // the coder ticked a diagnosis and never looked at the procedures; the
        // AI offered exactly one, so there is nothing to choose between
        var svc = withPayload("""
                [{"code":"K35.8","type":"ICD-10","selected":true},
                 {"code":"47.09","type":"ICD-9","origin":"ai"}]""");
        var picks = svc.effectiveCodes("c1");
        assertTrue(svc.coversBothSystems(picks));
        assertEquals(List.of("K35.8", "47.09"), codesOf(picks));
    }

    @Test
    void twoPredictionsAreAChoiceAndTheCaseWaits() {
        var svc = withPayload("""
                [{"code":"K35.8","type":"ICD-10","selected":true},
                 {"code":"47.09","type":"ICD-9","origin":"ai"},
                 {"code":"47.01","type":"ICD-9","origin":"ai"}]""");
        var picks = svc.effectiveCodes("c1");
        assertFalse(svc.coversBothSystems(picks));
        assertEquals(List.of("K35.8"), codesOf(picks));
    }

    @Test
    void theHospitalsOwnCodeWinsOverSeveralGuesses() {
        var svc = withPayload("""
                [{"code":"K35.8","type":"ICD-10","selected":true},
                 {"code":"47.09","type":"ICD-9","origin":"hospital"},
                 {"code":"47.01","type":"ICD-9","origin":"ai"},
                 {"code":"47.02","type":"ICD-9","origin":"ai"}]""");
        var picks = svc.effectiveCodes("c1");
        assertTrue(svc.coversBothSystems(picks));
        assertEquals(List.of("K35.8", "47.09"), codesOf(picks));
    }

    @Test
    void aPayloadFromBeforeTheCheckboxStillApprovesWholesale() {
        var svc = withPayload("""
                [{"code":"K35.8","type":"ICD-10"},
                 {"code":"47.09","type":"ICD-9"}]""");
        var picks = svc.effectiveCodes("c1");
        assertTrue(svc.coversBothSystems(picks));
        assertEquals(List.of("K35.8", "47.09"), codesOf(picks));
    }

    @Test
    void anUnopenedCaseIsCoveredByTheHospitalsCodes() {
        var svc = service(null, List.of(importedRow("ICD-10", "principal_diagnosis"),
                                        importedRow("ICD-9", "procedure")));
        var picks = svc.effectiveCodes("c1");
        assertTrue(picks.entries().isEmpty());
        assertEquals(2, picks.imported().size());
        assertTrue(svc.coversBothSystems(picks));
    }

    @Test
    void anUnopenedCaseMissingAColumnIsBlocked() {
        var svc = service(null, List.of(importedRow("ICD-10", "principal_diagnosis")));
        assertFalse(svc.coversBothSystems(svc.effectiveCodes("c1")));
    }

    @Test
    void unresolvedGapRowsAreNotCodes() {
        var svc = withPayload("""
                [{"code":"K35.8","type":"ICD-10","selected":true},
                 {"code":"???","type":"ICD-9","missing":true}]""");
        assertFalse(svc.coversBothSystems(svc.effectiveCodes("c1")));
    }
}
