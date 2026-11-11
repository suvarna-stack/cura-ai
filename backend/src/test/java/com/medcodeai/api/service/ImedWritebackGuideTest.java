package com.medcodeai.api.service;

import com.medcodeai.api.client.ImedApiClient;
import com.medcodeai.api.repo.ImedWriteOpsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The write bodies we send, checked against the hospital's own guide
 * ("คู่มือเชื่อมต่อ MedCode กับ Medihack API", 4 Nov 2026, sections
 * POST/PUT/DELETE /api/v1/diagnosis). The mock hospital used to enforce these
 * rules with 400s; it is gone (2026-11-10), so this is now the only place
 * they are checked. No DB and no hospital: the client and journal are mocks.
 */
class ImedWritebackGuideTest {

    private static final String VISIT = "VISIT-001";
    private static final String NOW = "2026-11-11 09:00:00";
    /** MCAI-&lt;visit_id&gt;-&lt;UUID v4&gt;, the guide's request_id shape. */
    private static final String REQUEST_ID =
            "MCAI-" + VISIT + "-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
    private static final Set<String> DIAGNOSIS_TYPES =
            Set.of("PRIMARY_DIAGNOSIS", "COMORBIDITY", "OTHERS", "EXTERNAL_CAUSE_OF_INJURY");
    private static final Set<String> OPERATION_TYPES =
            Set.of("OR Procedure", "NON OR Procedure", "OTH", "GENERAL_OPERATION");
    private static final Set<String> ENVELOPE =
            Set.of("request_id", "object_id", "fix_visit_type_id", "doctor_discharge", "coding_status");

    private ImedApiClient imed;
    private ImedWriteOpsRepository ops;
    private ImedWritebackService writeback;

    @BeforeEach
    void setUp() {
        imed = mock(ImedApiClient.class);
        ops = mock(ImedWriteOpsRepository.class);
        writeback = new ImedWritebackService(imed, ops);
        when(imed.postDiagnosis(any())).thenReturn(Map.of("mock", true, "status", "STATUS_SUCCESS"));
    }

    private void hospitalHolds(List<Map<String, Object>> diagnoses, List<Map<String, Object>> procedures) {
        when(imed.syncCases(List.of(VISIT))).thenReturn(Map.of("cases",
                List.of(Map.of("diagnoses", diagnoses, "procedures", procedures)), "not_found", List.of()));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> sentPost() {
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(imed).postDiagnosis(body.capture());
        return body.getValue();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> sentPut() {
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(imed).putDiagnosis(eq(VISIT), body.capture());
        return body.getValue();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> onlyRow(Map<String, Object> body, String key) {
        List<Map<String, Object>> rows = (List<Map<String, Object>>) body.get(key);
        assertEquals(1, rows.size(), key);
        return rows.get(0);
    }

    private static void assertEnvelope(Map<String, Object> body, String visitType, String codingStatus) {
        assertTrue(((String) body.get("request_id")).matches(REQUEST_ID), "request_id " + body.get("request_id"));
        assertEquals(VISIT, body.get("object_id"));
        assertEquals(visitType, body.get("fix_visit_type_id"));
        assertEquals("1", body.get("doctor_discharge"));
        assertEquals(codingStatus, body.get("coding_status"));
    }

    @Test
    void anOpdDiagnosisPostHasEveryRequiredField() {
        hospitalHolds(List.of(), List.of());
        writeback.approveCase(VISIT, "0", List.of(new ImedWritebackService.TargetCode(
                "icd10", "D17.1", "Lipoma", "PRIMARY_DIAGNOSIS", null, null, null)), "coder@example.org", NOW);

        Map<String, Object> body = sentPost();
        assertEnvelope(body, "OPD", "approved");
        assertEquals(union(ENVELOPE, Set.of("diagnosis_icd10", "diagnosis_icd9", "doctor_discharge_opd")),
                body.keySet(), "no field outside the guide's set");
        assertEquals(List.of(), body.get("diagnosis_icd9"), "the other array is [] on POST");
        Map<String, Object> row = onlyRow(body, "diagnosis_icd10");
        assertEquals(Set.of("icd10_code", "fix_diagnosis_type_id", "fix_dx_source", "coder_eid",
                "icd10_description", "beginning_diagnosis"), row.keySet());
        assertEquals("D17.1", row.get("icd10_code"));
        assertEquals("PRIMARY_DIAGNOSIS", row.get("fix_diagnosis_type_id"));
        assertEquals("MED_DC", row.get("fix_dx_source"));
        assertEquals("coder@example.org", row.get("coder_eid"));
        assertEquals(row.get("icd10_description"), row.get("beginning_diagnosis"), "the pair must match");
        Map<?, ?> discharge = (Map<?, ?>) body.get("doctor_discharge_opd");
        assertEquals(Set.of("fix_opd_discharge_status_id"), discharge.keySet());
        assertFalse(((String) discharge.get("fix_opd_discharge_status_id")).isBlank());
        verify(imed, never()).putDiagnosis(any(), any());
    }

    @Test
    void anIpdProcedurePostSplitsTheWindowIntoDateAndTime() {
        hospitalHolds(List.of(), List.of());
        writeback.approveCase(VISIT, "1", List.of(new ImedWritebackService.TargetCode(
                "icd9", "86.3", null, null, "2026-11-04 08:10:00", "2026-11-04 08:20:00", null)),
                "coder@example.org", NOW);

        Map<String, Object> body = sentPost();
        assertEnvelope(body, "IPD", "approved");
        assertEquals(union(ENVELOPE, Set.of("diagnosis_icd10", "diagnosis_icd9", "doctor_discharge_ipd")),
                body.keySet());
        assertEquals(List.of(), body.get("diagnosis_icd10"));
        Map<String, Object> row = onlyRow(body, "diagnosis_icd9");
        assertEquals(Set.of("icd9_code", "fix_operation_type_id", "is_from",
                "date_in", "time_in", "date_out", "time_out"), row.keySet(), "no blank description pair");
        assertTrue(OPERATION_TYPES.contains(row.get("fix_operation_type_id")));
        assertEquals("MED_DC", row.get("is_from"));
        assertEquals("2026-11-04", row.get("date_in"));
        assertEquals("08:10:00", row.get("time_in"));
        assertEquals("2026-11-04", row.get("date_out"));
        assertEquals("08:20:00", row.get("time_out"));
        Map<?, ?> discharge = (Map<?, ?>) body.get("doctor_discharge_ipd");
        assertEquals(Set.of("fix_ipd_discharge_status_id", "fix_ipd_discharge_type_id", "is_from"),
                discharge.keySet());
        assertEquals("MED_DC", discharge.get("is_from"));
    }

    @Test
    void anEditPutSendsOnlyTheChangedArrayAndNoDischarge() {
        hospitalHolds(List.of(Map.of("object_id", "DX-001", "icd10_code", "D17.1",
                "description", "Lipoma", "diagnosis_type", "COMORBIDITY")), List.of());
        writeback.approveCase(VISIT, "0", List.of(new ImedWritebackService.TargetCode(
                "icd10", "D17.1", "Lipoma", "PRIMARY_DIAGNOSIS", null, null, null)), "coder@example.org", NOW);

        Map<String, Object> body = sentPut();
        assertEnvelope(body, "OPD", "approved");
        assertEquals(union(ENVELOPE, Set.of("diagnosis_icd10")), body.keySet(),
                "the other array is ABSENT on PUT, and no discharge object");
        Map<String, Object> row = onlyRow(body, "diagnosis_icd10");
        assertEquals("DX-001", row.get("object_id"));
        assertEquals("PRIMARY_DIAGNOSIS", row.get("fix_diagnosis_type_id"));
        assertFalse(row.containsKey("fix_dx_source"), "create-only fields stay out of a PUT");
        verify(imed, never()).postDiagnosis(any());
    }

    @Test
    void nothingToChangeIsAStatusOnlyPut() {
        hospitalHolds(List.of(Map.of("object_id", "DX-001", "icd10_code", "D17.1",
                "description", "Lipoma", "diagnosis_type", "PRIMARY_DIAGNOSIS")), List.of());
        writeback.approveCase(VISIT, "0", List.of(new ImedWritebackService.TargetCode(
                "icd10", "D17.1", "Lipoma", "PRIMARY_DIAGNOSIS", null, null, null)), "coder@example.org", NOW);

        Map<String, Object> body = sentPut();
        assertEnvelope(body, "OPD", "approved");
        assertEquals(ENVELOPE, body.keySet(), "status-only: no code arrays, no discharge object");
        verify(imed, never()).postDiagnosis(any());
    }

    @Test
    void aRemovedCodeIsCancelledByTheRowRoute() {
        hospitalHolds(List.of(), List.of(Map.of("object_id", "PROC-001", "icd9_code", "86.3",
                "description", "Excision")));
        writeback.approveCase(VISIT, "0", List.of(), "coder@example.org", NOW);

        verify(imed).cancelDiagnosis(VISIT, "icd9", "PROC-001");
    }

    @Test
    void reopenRecreatesAnUntypedDiagnosisWithAType() {
        // The hospital serves diagnosis_type null when it can't map it. If
        // approve cancelled such a row, reopen re-creates it by POST, where
        // fix_diagnosis_type_id is REQUIRED — a null would be a 400 on every
        // retry, so the reopen could never complete.
        when(ops.opsForCase(VISIT)).thenReturn(List.of(Map.of("code_kind", "icd10", "op", "cancelled",
                "object_id", "DX-009",
                "before_json", "{\"id\":\"DX-009\",\"icd\":\"R51\",\"name\":\"Headache\",\"diagnosistype\":null}")));
        hospitalHolds(List.of(), List.of());
        writeback.reopenCase(VISIT, "0", NOW);

        Map<String, Object> body = sentPost();
        assertEnvelope(body, "OPD", "open");
        Map<String, Object> row = onlyRow(body, "diagnosis_icd10");
        assertEquals("R51", row.get("icd10_code"));
        assertTrue(DIAGNOSIS_TYPES.contains(row.get("fix_diagnosis_type_id")),
                "fix_diagnosis_type_id was " + row.get("fix_diagnosis_type_id"));
        assertEquals("medcode.reopen", row.get("coder_eid"));
    }

    private static Set<String> union(Set<String> a, Set<String> b) {
        java.util.HashSet<String> out = new java.util.HashSet<>(a);
        out.addAll(b);
        return out;
    }
}
