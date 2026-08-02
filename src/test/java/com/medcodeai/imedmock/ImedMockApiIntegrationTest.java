package com.medcodeai.imedmock;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Drives the mock hospital API against the local seeded "imed" Postgres
 * (see scripts/seed_local_imed_pg.sh) — no test containers, no mocks.
 *
 * The /api/v1 write tests are self-resetting through the cancel flow:
 * cancelled rows stay in the tables (audit trail) but vanish from reads, so
 * re-runs see the same read state. request_ids are UUID-fresh per run because
 * imed_request_log dedup persists across runs by design.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ImedMockApiIntegrationTest {

    private static final String KNOWN_TN = "87026040104025824801";
    /** ApiV1AuthInterceptor's default when IMED_API_TOKEN is unset. */
    private static final String AUTH = "Bearer imed-mock-token";

    @Autowired
    private MockMvc mvc;

    private final JsonMapper json = new JsonMapper();

    private static String rid() {
        return "TEST-" + UUID.randomUUID();
    }

    // ---- extract reads ------------------------------------------------------

    @Test
    void healthzCountsPatients() throws Exception {
        mvc.perform(get("/api/healthz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.db").value("pg"));
        assertTrue(getJson("/api/healthz").get("patients").asInt() > 0);
    }

    @Test
    void casesListsAllPatientsVerbatim() throws Exception {
        JsonNode cases = getJson("/api/cases");
        assertTrue(cases.isArray() && cases.size() > 0);
        assertTrue(cases.get(0).has("transactionnumber"), "extract column names served verbatim");
        assertTrue(cases.get(0).has("healthcoverage"));
    }

    @Test
    void perCaseTablesServeRowsForKnownCase() throws Exception {
        JsonNode diags = getJson("/api/cases/" + KNOWN_TN + "/diagnoses");
        assertTrue(diags.size() > 0, "known case has imported diagnosis rows");
        assertTrue(diags.get(0).has("icd"));
        mvc.perform(get("/api/cases/{tn}/orders/labs", KNOWN_TN)).andExpect(status().isOk());
        mvc.perform(get("/api/cases/{tn}/vital-signs", KNOWN_TN)).andExpect(status().isOk());
    }

    @Test
    void icdCatalogsServeReferenceRows() throws Exception {
        JsonNode ten = getJson("/api/icd10-codes");
        JsonNode nine = getJson("/api/icd9-codes");
        assertTrue(ten.isArray() && ten.size() > 0, "ICD-10 catalog seeded at bootstrap");
        assertTrue(nine.isArray() && nine.size() > 0, "ICD-9 catalog seeded at bootstrap");
        assertTrue(ten.get(0).has("code") && ten.get(0).has("description"));
        assertTrue(nine.get(0).has("code") && nine.get(0).has("description"));
    }

    @Test
    void unknownCaseIs404() throws Exception {
        mvc.perform(get("/api/cases/does-not-exist/medical-records")).andExpect(status().isNotFound());
        mvc.perform(get("/api/cases/does-not-exist/coding-status")).andExpect(status().isNotFound());
    }

    // ---- /api/v1 auth -------------------------------------------------------

    @Test
    void apiV1RequiresBearerToken() throws Exception {
        mvc.perform(post("/api/v1/diagnosis").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("unauthorized"));
        mvc.perform(put("/api/v1/coding-status/{v}", KNOWN_TN)
                .header("Authorization", "Bearer wrong-token")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    // ---- /api/v1/diagnosis validation ---------------------------------------

    @Test
    void postRejectsUnknownVisitAndBadShapes() throws Exception {
        // unknown visit
        mvc.perform(post("/api/v1/diagnosis").header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","object_id":"no-such-visit","fix_visit_type_id":"IPD",
                         "doctor_discharge":"1","doctor_discharge_ipd":{
                           "fix_ipd_discharge_status_id":"S1","fix_ipd_discharge_type_id":"T1"}}"""
                        .formatted(rid())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("STATUS_BUSINESS_ERROR"))
                .andExpect(jsonPath("$.message").value("invalid_request"));

        // POST rows must not carry object_id
        mvc.perform(post("/api/v1/diagnosis").header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                         "doctor_discharge":"1",
                         "diagnosis_icd10":[{"object_id":"DX10-EXISTING","icd10_code":"A00",
                           "fix_diagnosis_type_id":"PRIMARY_DIAGNOSIS"}],
                         "doctor_discharge_ipd":{
                           "fix_ipd_discharge_status_id":"S1","fix_ipd_discharge_type_id":"T1"}}"""
                        .formatted(rid(), KNOWN_TN)))
                .andExpect(status().isBadRequest());

        // discharge object matching the visit type is required
        mvc.perform(post("/api/v1/diagnosis").header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                         "doctor_discharge":"1"}""".formatted(rid(), KNOWN_TN)))
                .andExpect(status().isBadRequest());
    }

    // ---- /api/v1/diagnosis full round trip ----------------------------------

    @Test
    void diagnosisCreateEditCancelRoundTrip() throws Exception {
        int diagsBefore = getJson("/api/cases/" + KNOWN_TN + "/diagnoses").size();
        int procsBefore = getJson("/api/cases/" + KNOWN_TN + "/procedures").size();

        // POST: one diagnosis + one procedure + IPD discharge, ids generated
        JsonNode created = postDiagnosis(rid(), "U07.1", "COVID-19", "93.90", "CPAP therapy");
        assertEquals("STATUS_SUCCESS", created.get("status").asString());
        String dxId = created.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        String pxId = created.get("result").get("diagnosis_icd9").get(0).get("object_id").asString();
        String dcId = created.get("result").get("doctor_discharge_ipd").get("object_id").asString();
        assertTrue(dxId.startsWith("DX10-") && pxId.startsWith("DX9-") && dcId.startsWith("DCI-"));

        // created rows are visible through the extract reads
        assertEquals(diagsBefore + 1, getJson("/api/cases/" + KNOWN_TN + "/diagnoses").size());
        assertEquals(procsBefore + 1, getJson("/api/cases/" + KNOWN_TN + "/procedures").size());
        JsonNode row = findById(getJson("/api/cases/" + KNOWN_TN + "/diagnoses"), dxId);
        assertNotNull(row, "created diagnosis served by the extract read");
        assertEquals("U07.1", row.get("icd").asString());
        assertEquals("PRIMARY_DIAGNOSIS", row.get("diagnosistype").asString());

        // PUT: edit the diagnosis by its object_id (code + type change)
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN).header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                         "doctor_discharge":"1",
                         "diagnosis_icd10":[{"object_id":"%s","icd10_code":"U07.2",
                           "fix_diagnosis_type_id":"COMORBIDITY"}]}"""
                        .formatted(rid(), KNOWN_TN, dxId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("STATUS_SUCCESS"))
                .andExpect(jsonPath("$.result.diagnosis_icd10[0].object_id").value(dxId));
        row = findById(getJson("/api/cases/" + KNOWN_TN + "/diagnoses"), dxId);
        assertEquals("U07.2", row.get("icd").asString());
        assertEquals("COMORBIDITY", row.get("diagnosistype").asString());

        // PUT with a row missing object_id is rejected (mock-only strictness)
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN).header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                         "doctor_discharge":"1",
                         "diagnosis_icd10":[{"icd10_code":"A00"}]}""".formatted(rid(), KNOWN_TN)))
                .andExpect(status().isBadRequest());

        // DELETE: cancel both rows — flagged, not deleted, gone from reads
        mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                .header("Authorization", AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.cancelled").value(true))
                .andExpect(jsonPath("$.result.object_id").value(dxId));
        mvc.perform(delete("/api/v1/diagnosis/{v}/icd9/{id}", KNOWN_TN, pxId)
                .header("Authorization", AUTH))
                .andExpect(status().isOk());
        assertEquals(diagsBefore, getJson("/api/cases/" + KNOWN_TN + "/diagnoses").size());
        assertEquals(procsBefore, getJson("/api/cases/" + KNOWN_TN + "/procedures").size());

        // cancel is idempotent
        mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                .header("Authorization", AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.cancelled").value(true));
    }

    @Test
    void duplicateIcd10CodeIs409() throws Exception {
        JsonNode created = postDiagnosis(rid(), "J96.0", "Acute respiratory failure", null, null);
        String dxId = created.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        try {
            mvc.perform(post("/api/v1/diagnosis").header("Authorization", AUTH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(icd10Body(rid(), "J96.0", "dup")))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.message").value("DIAGNOSIS_CODE_ALREADY_EXIST"));
        } finally { // cancel so re-runs and other tests see a clean read state
            mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                    .header("Authorization", AUTH)).andExpect(status().isOk());
        }
    }

    @Test
    void replayedRequestIdReturnsStoredResponseWithoutReExecuting() throws Exception {
        String requestId = rid();
        JsonNode first = postDiagnosis(requestId, "B34.9", "Viral infection", null, null);
        String dxId = first.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        try {
            int after = getJson("/api/cases/" + KNOWN_TN + "/diagnoses").size();
            // same request_id replayed: same body back, nothing inserted twice
            JsonNode second = postDiagnosis(requestId, "B34.9", "Viral infection", null, null);
            assertEquals(first, second, "replay must return the stored response verbatim");
            assertEquals(after, getJson("/api/cases/" + KNOWN_TN + "/diagnoses").size(),
                    "replay must not re-execute the insert");
        } finally {
            mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                    .header("Authorization", AUTH)).andExpect(status().isOk());
        }
    }

    // ---- /api/v1/coding-status ----------------------------------------------

    @Test
    void codingStatusRoundTrip() throws Exception {
        // self-reset: DELETE is idempotent, so start from the uncoded state
        mvc.perform(delete("/api/v1/coding-status/{v}", KNOWN_TN).header("Authorization", AUTH))
                .andExpect(status().isOk());
        mvc.perform(get("/api/cases/{tn}/coding-status", KNOWN_TN)).andExpect(status().isNotFound());

        mvc.perform(put("/api/v1/coding-status/{v}", KNOWN_TN).header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","coding_status":"approved",
                         "finalized_at":"2026-07-24 12:00:00","updated_by":"web.coder"}"""
                        .formatted(rid())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("STATUS_SUCCESS"))
                .andExpect(jsonPath("$.result.coding_status").value("approved"));

        mvc.perform(get("/api/cases/{tn}/coding-status", KNOWN_TN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coding_status").value("approved"))
                .andExpect(jsonPath("$.updated_by").value("web.coder"));

        mvc.perform(delete("/api/v1/coding-status/{v}", KNOWN_TN).header("Authorization", AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.cleared").value(true));
        mvc.perform(get("/api/cases/{tn}/coding-status", KNOWN_TN)).andExpect(status().isNotFound());
    }

    // ---- published contract -------------------------------------------------

    /** The published contract: generated from the code, so it cannot drift. */
    @Test
    void openApiDocumentCoversEveryEndpoint() throws Exception {
        JsonNode doc = getJson("/v3/api-docs");
        JsonNode paths = doc.get("paths");
        for (String p : new String[]{"/api/cases", "/api/cases/{tn}/medical-records",
                "/api/cases/{tn}/medical-record-results", "/api/cases/{tn}/diagnoses",
                "/api/cases/{tn}/procedures", "/api/cases/{tn}/orders/drugs",
                "/api/cases/{tn}/orders/labs", "/api/cases/{tn}/vital-signs",
                "/api/cases/{tn}/bed-management", "/api/cases/{tn}/billing-items",
                "/api/cases/{tn}/coding-status",
                "/api/icd10-codes", "/api/icd9-codes",
                "/api/v1/diagnosis", "/api/v1/diagnosis/{visit_id}",
                "/api/v1/diagnosis/{visit_id}/icd10/{diagnosis_icd10_id}",
                "/api/v1/diagnosis/{visit_id}/icd9/{diagnosis_icd9_id}",
                "/api/v1/coding-status/{visit_id}"}) {
            assertTrue(paths.has(p), "OpenAPI document is missing " + p);
        }
        // the old invented write-back is gone
        assertTrue(paths.get("/api/cases/{tn}/coding-result") == null,
                "superseded coding-result endpoint must not be published");
        // the write body is a real schema with the hospital's exact field names
        assertEquals("#/components/schemas/DiagnosisRequest",
                paths.get("/api/v1/diagnosis").get("post")
                        .get("requestBody").get("content").get("application/json")
                        .get("schema").get("$ref").asString());
        JsonNode reqSchema = doc.get("components").get("schemas").get("DiagnosisRequest");
        for (String field : new String[]{"request_id", "object_id", "fix_visit_type_id",
                "doctor_discharge", "diagnosis_icd10", "diagnosis_icd9",
                "doctor_discharge_opd", "doctor_discharge_ipd"}) {
            assertTrue(reqSchema.get("properties").has(field),
                    "DiagnosisRequest schema is missing PDF field " + field);
        }
        assertTrue(doc.get("components").get("schemas").get("Icd10Row")
                .get("properties").has("icd10_code"), "row schema keeps the PDF's snake_case names");
        // and the write surface advertises its Bearer requirement
        assertTrue(paths.get("/api/v1/diagnosis").get("post").has("security"),
                "bearerAuth requirement must be published on /api/v1 writes");
    }

    @Test
    void swaggerUiAndYamlAreServed() throws Exception {
        mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
        mvc.perform(get("/v3/api-docs.yaml")).andExpect(status().isOk());
    }

    @Test
    void actuatorReadinessChecksTheDatabase() throws Exception {
        mvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components.db.status").value("UP"));
    }

    // ---- helpers ------------------------------------------------------------

    /** POST one ICD-10 (+ optional ICD-9) with IPD discharge; returns the envelope. */
    private JsonNode postDiagnosis(String requestId, String icd10, String dxName,
            String icd9, String opName) throws Exception {
        String icd9Part = icd9 == null
                ? "[]"
                : """
                        [{"icd9_code":"%s","beginning_operation":"%s",
                          "fix_operation_type_id":"GENERAL_OPERATION","is_from":"MED_DC"}]"""
                        .formatted(icd9, opName);
        String body = """
                {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                 "doctor_discharge":"1",
                 "diagnosis_icd10":[{"icd10_code":"%s","beginning_diagnosis":"%s",
                   "fix_diagnosis_type_id":"PRIMARY_DIAGNOSIS","fix_dx_source":"MED_DC",
                   "coder_eid":"web.coder"}],
                 "diagnosis_icd9":%s,
                 "doctor_discharge_ipd":{"fix_ipd_discharge_status_id":"IPD_STATUS_1",
                   "fix_ipd_discharge_type_id":"IPD_TYPE_1","is_from":"MED_DC"}}"""
                .formatted(requestId, KNOWN_TN, icd10, dxName, icd9Part);
        String resp = mvc.perform(post("/api/v1/diagnosis").header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(resp);
    }

    private String icd10Body(String requestId, String icd10, String dxName) {
        return """
                {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                 "doctor_discharge":"1",
                 "diagnosis_icd10":[{"icd10_code":"%s","beginning_diagnosis":"%s",
                   "fix_diagnosis_type_id":"PRIMARY_DIAGNOSIS"}],
                 "doctor_discharge_ipd":{"fix_ipd_discharge_status_id":"IPD_STATUS_1",
                   "fix_ipd_discharge_type_id":"IPD_TYPE_1"}}"""
                .formatted(requestId, KNOWN_TN, icd10, dxName);
    }

    private JsonNode findById(JsonNode rows, String id) {
        for (JsonNode r : rows) {
            if (r.get("id") != null && id.equals(r.get("id").asString())) {
                return r;
            }
        }
        return null;
    }

    private JsonNode getJson(String url) throws Exception {
        String body = mvc.perform(get(url))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }
}
