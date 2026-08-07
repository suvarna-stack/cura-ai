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

    // C1-pneumonia-cxr from demo-data/generate_demo_cases.py (has diagnoses,
    // labs, vitals — the richest case in the curated 21-case demo dataset)
    private static final String KNOWN_TN = "87026072413210500101";
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
    void casesListWindowsOnVisitDatetime() throws Exception {
        // from/to filter on the visit datetime (TN positions 4-15, since the
        // extract's admissiondatetime is blank); whole-day bounds, inclusive
        JsonNode windowed = getJson("/api/cases?from=2026-07-24&to=2026-07-25");
        assertTrue(windowed.size() > 0, "seeded visits exist on 2026-07-24/25");
        JsonNode all = getJson("/api/cases");
        assertTrue(windowed.size() < all.size(), "window must actually filter");
        for (JsonNode c : windowed) {
            String day = c.get("transactionnumber").asString().substring(3, 9);
            assertTrue(day.equals("260724") || day.equals("260725"),
                    "visit outside window served: " + c.get("transactionnumber"));
        }
        // datetime bounds narrow within a day; out-of-range is empty, not an error
        String afternoon = mvc.perform(get("/api/cases")
                        .param("from", "2026-07-24 14:00").param("to", "2026-07-24T23:59"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertTrue(json.readTree(afternoon).size() > 0, "T and space datetime forms both accepted");
        assertEquals(0, getJson("/api/cases?from=2030-01-01").size());
        mvc.perform(get("/api/cases").param("from", "tuesday"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void casesListChangedSinceSeesApiWrites() throws Exception {
        String farFuture = "2100-01-01";
        assertEquals(0, getJson("/api/cases?changed_since=" + farFuture).size());

        // a write through /api/v1 stamps updated_at → the case (visit dated
        // 2026-07-24) surfaces for a changed_since long after its visit
        String today = java.time.LocalDate.now().toString();
        JsonNode created = postDiagnosis(rid(), "Z01.8", "Other specified special examinations",
                null, null);
        String dxId = created.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        try {
            assertTrue(containsTn(getJson("/api/cases?changed_since=" + today), KNOWN_TN),
                    "written case must match changed_since");
        } finally {
            mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                    .header("Authorization", AUTH)).andExpect(status().isOk());
        }
        // a cancel is a change too — the case still matches after cleanup
        assertTrue(containsTn(getJson("/api/cases?changed_since=" + today), KNOWN_TN));
    }

    private static boolean containsTn(JsonNode cases, String tn) {
        for (JsonNode c : cases) {
            if (tn.equals(c.get("transactionnumber").asString())) {
                return true;
            }
        }
        return false;
    }

    @Test
    void perCaseTablesServeRowsForKnownCase() throws Exception {
        // The demo dataset starts UNCODED (2026-08-05 empty-start-state prep):
        // diagnoses/procedures are empty until a write-back lands, so assert
        // the clinical tables that do ship rows.
        JsonNode notes = getJson("/api/cases/" + KNOWN_TN + "/medical-records");
        assertTrue(notes.size() > 0, "known case has clinical note rows");
        assertTrue(notes.get(0).has("recorddatetime"), "extract column names served verbatim");
        assertTrue(getJson("/api/cases/" + KNOWN_TN + "/orders/labs").size() > 0);
        assertTrue(getJson("/api/cases/" + KNOWN_TN + "/vital-signs").size() > 0);
        assertTrue(getJson("/api/cases/" + KNOWN_TN + "/diagnoses").isArray(),
                "uncoded case serves [] (not an error) for diagnoses");
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

    // ---- demo baseline (mock-only tooling) ----------------------------------

    @Test
    void demoSnapshotAndResetRestoreHospitalState() throws Exception {
        mvc.perform(post("/api/demo/snapshot")).andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
        int diagsBefore = getJson("/api/cases/" + KNOWN_TN + "/diagnoses").size();

        // a write-back lands...
        postDiagnosis(rid(), "Z00.0", "General medical examination", "89.7",
                "General physical examination");
        assertEquals(diagsBefore + 1, getJson("/api/cases/" + KNOWN_TN + "/diagnoses").size());

        // ...and reset restores the snapshotted hospital state
        mvc.perform(post("/api/demo/reset")).andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
        assertEquals(diagsBefore, getJson("/api/cases/" + KNOWN_TN + "/diagnoses").size());
    }

    @Test
    void unknownCaseIs404() throws Exception {
        mvc.perform(get("/api/cases/does-not-exist/medical-records")).andExpect(status().isNotFound());
        mvc.perform(get("/api/cases/does-not-exist/diagnoses")).andExpect(status().isNotFound());
    }

    // ---- /api/v1 auth -------------------------------------------------------

    @Test
    void apiV1RequiresBearerToken() throws Exception {
        mvc.perform(post("/api/v1/diagnosis").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("unauthorized"));
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN)
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
        // the doctor's clinical discharge outcome — no /api/v1 write may touch it
        String dischargeBefore = String.valueOf(patient(KNOWN_TN).get("dischargestatus"));

        // POST: one diagnosis + one procedure + IPD discharge, ids generated
        JsonNode created = postDiagnosis(rid(), "U07.1", "COVID-19", "93.90", "CPAP therapy");
        assertEquals("STATUS_SUCCESS", created.get("status").asString());
        String dxId = created.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        String pxId = created.get("result").get("diagnosis_icd9").get(0).get("object_id").asString();
        String dcId = created.get("result").get("doctor_discharge_ipd").get("object_id").asString();
        assertTrue(dxId.startsWith("DX10-") && pxId.startsWith("DX9-") && dcId.startsWith("DCI-"));

        // …the coding status the POST carried marks the visit's own extract row
        assertEquals("approved", patient(KNOWN_TN).get("coding_status").asString());
        assertEquals("approved", created.get("result").get("coding_status").asString());
        // …and the doctor's discharge column is untouched (it lives in
        // doctor_discharge_ipd now, not on the patient row)
        assertEquals(dischargeBefore, String.valueOf(patient(KNOWN_TN).get("dischargestatus")));

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

        // PUT of the discharge object edits the discharge row only — the visit
        // row's clinical column still isn't ours to write
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN).header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                         "doctor_discharge":"1",
                         "doctor_discharge_ipd":{"object_id":"%s",
                           "fix_ipd_discharge_status_id":"IPD_STATUS_2"}}"""
                        .formatted(rid(), KNOWN_TN, dcId)))
                .andExpect(status().isOk());
        assertEquals(dischargeBefore, String.valueOf(patient(KNOWN_TN).get("dischargestatus")));

        // a body carrying nothing but coding_status clears the mark (reopen)
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN).header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                         "doctor_discharge":"1","coding_status":"open"}"""
                        .formatted(rid(), KNOWN_TN)))
                .andExpect(status().isOk());
        assertTrue(patient(KNOWN_TN).get("coding_status").isNull(), "reopen clears coding_status");

        // an unknown word is a business error, not a silently stored string
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN).header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                         "doctor_discharge":"1","coding_status":"halfway"}"""
                        .formatted(rid(), KNOWN_TN)))
                .andExpect(status().isBadRequest());

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
                "/api/icd10-codes", "/api/icd9-codes",
                "/api/demo/snapshot", "/api/demo/reset",
                "/api/v1/diagnosis", "/api/v1/diagnosis/{visit_id}",
                "/api/v1/diagnosis/{visit_id}/icd10/{diagnosis_icd10_id}",
                "/api/v1/diagnosis/{visit_id}/icd9/{diagnosis_icd9_id}"}) {
            assertTrue(paths.has(p), "OpenAPI document is missing " + p);
        }
        // superseded/withdrawn surfaces must not be published
        assertTrue(paths.get("/api/cases/{tn}/coding-result") == null,
                "superseded coding-result endpoint must not be published");
        assertTrue(paths.get("/api/v1/coding-status/{visit_id}") == null,
                "withdrawn coding-status extension must not be published");
        assertTrue(paths.get("/api/cases/{tn}/coding-status") == null,
                "withdrawn coding-status read must not be published");
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
                 "doctor_discharge":"1","coding_status":"approved",
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

    /** The visit's row from the case-list read (medhack_patient, verbatim). */
    private JsonNode patient(String tn) throws Exception {
        for (JsonNode c : getJson("/api/cases")) {
            if (tn.equals(c.get("transactionnumber").asString())) {
                return c;
            }
        }
        throw new AssertionError("visit " + tn + " missing from /api/cases");
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
