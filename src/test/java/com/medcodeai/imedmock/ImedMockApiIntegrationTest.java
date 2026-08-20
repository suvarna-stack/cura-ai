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

    /** Only for parking the demo baseline around the snapshot/reset test. */
    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

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
    void updateCheckSeesApiWrites() throws Exception {
        assertEquals(0, changedSince("2100-01-01").size(), "nothing changed after the far future");

        // a write through /api/v1 stamps the visit → it surfaces for a
        // changed_since long after its own visit date (2026-07-24)
        String today = java.time.LocalDate.now().toString();
        JsonNode created = postDiagnosis(rid(), "Z01.8", "Other specified special examinations",
                null, null);
        String dxId = created.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        try {
            assertTrue(contains(changedSince(today), KNOWN_TN),
                    "a written visit must be reported as changed");
        } finally {
            mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                    .header("Authorization", AUTH)).andExpect(status().isOk());
        }
        // a cancel is a change too — the visit still matches after cleanup
        assertTrue(contains(changedSince(today), KNOWN_TN));
    }

    /** R1's visit_ids for a bound. */
    private JsonNode changedSince(String bound) throws Exception {
        return postV1Json("/api/v1/cases/check", "{\"changed_since\":\"" + bound + "\"}")
                .get("visit_ids");
    }

    private static boolean contains(JsonNode ids, String tn) {
        for (JsonNode id : ids) {
            if (tn.equals(id.asString())) {
                return true;
            }
        }
        return false;
    }

    // ---- demo baseline (mock-only tooling) ----------------------------------

    /**
     * Snapshot OVERWRITES imed_baseline — the demo's start state. This suite
     * runs against the live demo database, so taking one here would freeze
     * whatever happens to be live (a real coder's approve included) as the
     * state every future reset restores. That happened once, on 2026-08-07:
     * a test run five minutes after an approve baked it into the baseline,
     * and resetting the demo kept bringing the approved case back.
     *
     * So the test parks any existing baseline first and puts it back in a
     * finally block — it exercises snapshot/reset for real, on a baseline it
     * owns, and leaves the demo's own untouched.
     */
    @Test
    void demoSnapshotAndResetRestoreHospitalState() throws Exception {
        boolean parked = parkExistingBaseline();
        try {
            mvc.perform(post("/api/demo/snapshot")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.ok").value(true));
            int diagsBefore = caseObject(KNOWN_TN).get("diagnoses").size();

            // a write-back lands...
            postDiagnosis(rid(), "Z00.0", "General medical examination", "89.7",
                    "General physical examination");
            assertEquals(diagsBefore + 1, caseObject(KNOWN_TN).get("diagnoses").size());

            // ...and reset restores the snapshotted hospital state
            mvc.perform(post("/api/demo/reset")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.ok").value(true));
            assertEquals(diagsBefore, caseObject(KNOWN_TN).get("diagnoses").size());
        } finally {
            restoreParkedBaseline(parked);
        }
    }

    /** Moves the demo's baseline out of the way; false when there wasn't one. */
    private boolean parkExistingBaseline() {
        if (jdbc.queryForList("SELECT 1 FROM pg_namespace WHERE nspname = 'imed_baseline'").isEmpty()) {
            return false;
        }
        jdbc.execute("DROP SCHEMA IF EXISTS imed_baseline_parked CASCADE");
        jdbc.execute("ALTER SCHEMA imed_baseline RENAME TO imed_baseline_parked");
        return true;
    }

    private void restoreParkedBaseline(boolean parked) {
        if (!parked) {
            return;
        }
        jdbc.execute("DROP SCHEMA IF EXISTS imed_baseline CASCADE");
        jdbc.execute("ALTER SCHEMA imed_baseline_parked RENAME TO imed_baseline");
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
        int diagsBefore = caseObject(KNOWN_TN).get("diagnoses").size();
        int procsBefore = caseObject(KNOWN_TN).get("procedures").size();
        // the doctor's clinical discharge outcome — no /api/v1 write may touch it
        String dischargeBefore = String.valueOf(patient(KNOWN_TN).get("discharge_status"));

        // POST: one diagnosis + one procedure + IPD discharge, ids generated
        JsonNode created = postDiagnosis(rid(), "U07.1", "COVID-19", "93.90", "CPAP therapy",
                "approved");
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
        assertEquals(dischargeBefore, String.valueOf(patient(KNOWN_TN).get("discharge_status")));

        // created rows are visible through the extract reads
        assertEquals(diagsBefore + 1, caseObject(KNOWN_TN).get("diagnoses").size());
        assertEquals(procsBefore + 1, caseObject(KNOWN_TN).get("procedures").size());
        JsonNode row = findByObjectId(caseObject(KNOWN_TN).get("diagnoses"), dxId);
        assertNotNull(row, "created diagnosis is served by the contract read");
        assertEquals("U07.1", row.get("icd10_code").asString());
        assertEquals("PRIMARY_DIAGNOSIS", row.get("diagnosis_type").asString());

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
        row = findByObjectId(caseObject(KNOWN_TN).get("diagnoses"), dxId);
        assertEquals("U07.2", row.get("icd10_code").asString());
        assertEquals("COMORBIDITY", row.get("diagnosis_type").asString());

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
        assertEquals(dischargeBefore, String.valueOf(patient(KNOWN_TN).get("discharge_status")));

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
        assertEquals(diagsBefore, caseObject(KNOWN_TN).get("diagnoses").size());
        assertEquals(procsBefore, caseObject(KNOWN_TN).get("procedures").size());

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
            int after = caseObject(KNOWN_TN).get("diagnoses").size();
            // same request_id replayed: same body back, nothing inserted twice
            JsonNode second = postDiagnosis(requestId, "B34.9", "Viral infection", null, null);
            assertEquals(first, second, "replay must return the stored response verbatim");
            assertEquals(after, caseObject(KNOWN_TN).get("diagnoses").size(),
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
        for (String p : new String[]{
                "/api/v1/cases/check", "/api/v1/cases/sync", "/api/v1/cases/sync-by-period",
                "/api/v1/catalog/icd10", "/api/v1/catalog/icd9", "/api/v1/contract/check",
                "/api/demo/snapshot", "/api/demo/reset",
                "/api/v1/diagnosis", "/api/v1/diagnosis/{visit_id}",
                "/api/v1/diagnosis/{visit_id}/icd10/{diagnosis_icd10_id}",
                "/api/v1/diagnosis/{visit_id}/icd9/{diagnosis_icd9_id}"}) {
            assertTrue(paths.has(p), "OpenAPI document is missing " + p);
        }
        // superseded/withdrawn surfaces must not be published — the one-endpoint
        // -per-extract-table read layer was removed 2026-08-19, replaced by R1-R6
        for (String gone : new String[]{"/api/cases", "/api/cases/{tn}/medical-records",
                "/api/cases/{tn}/diagnoses", "/api/cases/{tn}/orders/labs",
                "/api/icd10-codes", "/api/icd9-codes"}) {
            assertTrue(paths.get(gone) == null, "removed legacy read endpoint is still published: " + gone);
        }
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
        return postDiagnosis(requestId, icd10, dxName, icd9, opName, null);
    }

    /**
     * …optionally carrying the coding_status extension. Tests that don't assert
     * on it pass null DELIBERATELY: this suite writes to the live demo `imed`
     * database, and a marked visit reads as an approved case in the hospital DB
     * that medcode knows nothing about. Only the round-trip test sets it, and
     * that test clears it again before finishing.
     */
    private JsonNode postDiagnosis(String requestId, String icd10, String dxName,
            String icd9, String opName, String codingStatus) throws Exception {
        String statusPart = codingStatus == null
                ? ""
                : "\"coding_status\":\"%s\",".formatted(codingStatus);
        String icd9Part = icd9 == null
                ? "[]"
                : """
                        [{"icd9_code":"%s","beginning_operation":"%s",
                          "fix_operation_type_id":"GENERAL_OPERATION","is_from":"MED_DC"}]"""
                        .formatted(icd9, opName);
        String body = """
                {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                 "doctor_discharge":"1",%s
                 "diagnosis_icd10":[{"icd10_code":"%s","beginning_diagnosis":"%s",
                   "fix_diagnosis_type_id":"PRIMARY_DIAGNOSIS","fix_dx_source":"MED_DC",
                   "coder_eid":"web.coder"}],
                 "diagnosis_icd9":%s,
                 "doctor_discharge_ipd":{"fix_ipd_discharge_status_id":"IPD_STATUS_1",
                   "fix_ipd_discharge_type_id":"IPD_TYPE_1","is_from":"MED_DC"}}"""
                .formatted(requestId, KNOWN_TN, statusPart, icd10, dxName, icd9Part);
        String resp = mvc.perform(post("/api/v1/diagnosis").header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(resp);
    }

    // ---- contract reads (R1-R6) ---------------------------------------------

    @Test
    void updateCheckReportsChangedVisits() throws Exception {
        JsonNode all = postV1Json("/api/v1/cases/check", "{\"changed_since\":\"2000-01-01T00:00:00\"}");
        assertTrue(all.get("has_changes").asBoolean(), "every seeded visit changed after 2000");
        assertTrue(all.get("visit_ids").size() > 0);

        JsonNode none = postV1Json("/api/v1/cases/check", "{\"changed_since\":\"2999-01-01T00:00:00\"}");
        assertEquals(false, none.get("has_changes").asBoolean());
        assertEquals(0, none.get("visit_ids").size(), "empty array, not a missing key");

        // a bare date is widened to the start of that day rather than rejected
        mvc.perform(post("/api/v1/cases/check").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"changed_since\":\"2000-01-01\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/cases/check").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"changed_since\":\"yesterday\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("STATUS_BUSINESS_ERROR"));
    }

    @Test
    void syncByIdsServesTheWholeCaseObject() throws Exception {
        JsonNode body = postV1Json("/api/v1/cases/sync",
                "{\"visit_ids\":[\"" + KNOWN_TN + "\",\"NO-SUCH-VISIT\"]}");
        assertEquals(1, body.get("cases").size());
        assertEquals("NO-SUCH-VISIT", body.get("not_found").get(0).asString(),
                "unknown ids are reported, not an error for the whole request");

        JsonNode c = body.get("cases").get(0);
        for (String block : new String[]{"visit", "documents", "record_results", "diagnoses",
                "procedures", "drug_orders", "lab_results", "vitals", "ward_movements",
                "billing_items"}) {
            assertTrue(c.has(block), "case object is missing block " + block);
        }
        JsonNode visit = c.get("visit");
        assertEquals(KNOWN_TN, visit.get("visit_id").asString(), "renamed from transactionnumber");
        assertEquals("OPD", visit.get("encounter_type").asString(), "derived: no admission number");
        assertTrue(visit.get("age_year").isNumber(), "age_year is a number, not the extract's y,m,d text");
        assertTrue(visit.has("coding_status") && visit.has("last_changed_at"),
                "the two requested additions are served (null is fine, absent is not)");
        assertEquals(10, visit.get("birth_date").asString().length(), "birth_date is a plain date");

        // ISO 8601 on the wire; the extract stores "YYYY-MM-DD HH:MM:SS"
        String recordedAt = c.get("documents").get(0).get("recorded_at").asString();
        assertEquals('T', recordedAt.charAt(10), "date-times are ISO 8601: " + recordedAt);
        assertTrue(c.get("lab_results").get(0).has("panel_name"), "lab rows keep the panel fields");
    }

    @Test
    void syncByIdsRefusesMoreThanTheBatchCap() throws Exception {
        StringBuilder ids = new StringBuilder();
        for (int i = 0; i <= 20; i++) { // one over the cap
            ids.append(i == 0 ? "" : ",").append("\"V").append(i).append("\"");
        }
        mvc.perform(post("/api/v1/cases/sync").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visit_ids\":[" + ids + "]}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.message").value("too_many_visit_ids"));
    }

    @Test
    void syncByPeriodWindowsOnTheVisitDatetimeAndCapsTheWindow() throws Exception {
        JsonNode day = postV1Json("/api/v1/cases/sync-by-period",
                "{\"from\":\"2026-07-24T00:00:00\",\"to\":\"2026-07-24T23:59:59\"}");
        assertTrue(day.get("cases").size() > 0, "seeded visits exist on 2026-07-24");
        for (JsonNode c : day.get("cases")) {
            assertTrue(c.get("visit").get("visit_id").asString().startsWith("870260724"),
                    "the window selects on the visit datetime encoded in the TN");
        }
        // R3 answers with cases only — not_found belongs to the id-based R2
        assertTrue(day.get("not_found") == null);

        mvc.perform(post("/api/v1/cases/sync-by-period").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"from\":\"2026-07-01T00:00:00\",\"to\":\"2026-08-02T00:00:01\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.message").value("period_too_long"));
    }

    @Test
    void contractCheckNamesTheFieldsItCannotServe() throws Exception {
        JsonNode ok = postV1Json("/api/v1/contract/check",
                "{\"required_fields\":[\"visit.visit_id\",\"documents.text\","
                        + "\"diagnoses.icd10_code\",\"procedures.operation_start\"]}");
        assertTrue(ok.get("valid").asBoolean());
        assertTrue(ok.get("missing") == null, "missing is absent when valid");

        // the contract's own Priority-2 wishes are exactly what this must catch
        JsonNode gap = postV1Json("/api/v1/contract/check",
                "{\"required_fields\":[\"visit.visit_id\",\"lab_results.reference_range\"]}");
        assertEquals(false, gap.get("valid").asBoolean());
        assertEquals("lab_results.reference_range", gap.get("missing").get(0).asString());
    }

    @Test
    void contractCatalogsCarryTheEditionKey() throws Exception {
        JsonNode ten = getV1Json("/api/v1/catalog/icd10");
        JsonNode nine = getV1Json("/api/v1/catalog/icd9");
        assertTrue(ten.size() > 0 && nine.size() > 0);
        for (String field : new String[]{"code", "description", "edition"}) {
            assertTrue(ten.get(0).has(field), "R4 row is missing " + field);
        }
        assertTrue(ten.get(0).get("edition").isNull(),
                "edition is null until the hospital's catalogue carries one");
    }

    @Test
    void contractReadsRequireBearerToken() throws Exception {
        mvc.perform(post("/api/v1/cases/check").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"changed_since\":\"2000-01-01\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/catalog/icd10")).andExpect(status().isUnauthorized());
    }

    @Test
    void cancelledCodeRowsNeverComeBackThroughTheContractRead() throws Exception {
        String rid = rid();
        String created = postDiagnosis(rid, "J18.9", "Pneumonia probe", null, null)
                .get("result").get("diagnosis_icd10").get(0).get("object_id").asString();

        assertNotNull(findByObjectId(caseObject(KNOWN_TN).get("diagnoses"), created),
                "a created row is visible to R2");

        mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, created)
                .header("Authorization", AUTH)).andExpect(status().isOk());

        assertTrue(findByObjectId(caseObject(KNOWN_TN).get("diagnoses"), created) == null,
                "a cancelled row must never reappear — it would resurrect a code the coder removed");
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

    /** The visit block of the contract read, for the write tests' assertions. */
    private JsonNode patient(String tn) throws Exception {
        return caseObject(tn).get("visit");
    }

    /** The R2 case object for one visit. */
    private JsonNode caseObject(String tn) throws Exception {
        return postV1Json("/api/v1/cases/sync", "{\"visit_ids\":[\"" + tn + "\"]}")
                .get("cases").get(0);
    }

    private JsonNode findByObjectId(JsonNode rows, String objectId) {
        for (JsonNode r : rows) {
            if (r.get("object_id") != null && objectId.equals(r.get("object_id").asString())) {
                return r;
            }
        }
        return null;
    }

    private JsonNode postV1Json(String url, String body) throws Exception {
        return json.readTree(mvc.perform(post(url).header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode getV1Json(String url) throws Exception {
        return json.readTree(mvc.perform(get(url).header("Authorization", AUTH))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode getJson(String url) throws Exception {
        String body = mvc.perform(get(url))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }
}
