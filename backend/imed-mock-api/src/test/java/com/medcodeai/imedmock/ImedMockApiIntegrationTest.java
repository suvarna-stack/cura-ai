package com.medcodeai.imedmock;

import com.medcodeai.imedmock.config.TokenStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
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
    /** TokenStore's defaults when IMED_CLIENT_ID / IMED_CLIENT_SECRET are unset. */
    private static final String BASIC = "Basic " + Base64.getEncoder().encodeToString(
            "medcode-mock-client:medcode-mock-secret".getBytes(StandardCharsets.UTF_8));

    @Autowired
    private MockMvc mvc;

    @Autowired
    private TokenStore tokens;

    /** "Bearer <token>" — fetched through POST /auth/token before every test, as a client would. */
    private String auth;

    /** Only for parking the demo baseline around the snapshot/reset test. */
    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    private final JsonMapper json = new JsonMapper();

    /** A fresh request_id in the guide's MCAI-<visit_id>-<UUID v4> form, for KNOWN_TN. */
    private static String rid() {
        return rid(KNOWN_TN);
    }

    private static String rid(String visitId) {
        return "MCAI-" + visitId + "-" + UUID.randomUUID();
    }

    @BeforeEach
    void fetchToken() throws Exception {
        String body = mvc.perform(post("/auth/token").header("Authorization", BASIC)
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .content("grant_type=client_credentials"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        auth = "Bearer " + json.readTree(body).get("access_token").asString();
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
    void lastChangedAtMovesWithApiWrites() throws Exception {
        // a write through /api/v1 stamps the visit → last_changed_at jumps to
        // today, long after its own visit date (2026-07-24). This replaced the
        // R1 /cases/check test when the hospital parked that route.
        String today = java.time.LocalDate.now().toString();
        JsonNode created = postDiagnosis(rid(), "Z01.8", "Other specified special examinations");
        String dxId = created.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        try {
            String stamp = patient(KNOWN_TN).get("last_changed_at").asString();
            assertEquals(today, stamp.substring(0, 10), "a written visit reports the write time");
            assertTrue(stamp.endsWith("+07:00"), "last_changed_at carries the offset: " + stamp);
        } finally {
            mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                    .header("Authorization", auth)).andExpect(status().isOk());
        }
        // a cancel is a change too
        assertEquals(today, patient(KNOWN_TN).get("last_changed_at").asString().substring(0, 10));
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
            postDiagnosis(rid(), "Z00.0", "General medical examination");
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
                .andExpect(jsonPath("$.message").value("unauthorized"))
                .andExpect(jsonPath("$.status").doesNotExist());
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN)
                .header("Authorization", "Bearer wrong-token")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        // the retired static token is just another wrong token now
        mvc.perform(get("/api/v1/catalog/icd9").header("Authorization", "Bearer imed-mock-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenEndpointIssuesShortLivedBearerTokens() throws Exception {
        mvc.perform(post("/auth/token").header("Authorization", BASIC)
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .content("grant_type=client_credentials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token_type").value("Bearer"))
                .andExpect(jsonPath("$.expires_in").value(300))
                .andExpect(jsonPath("$.access_token").isString())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string("Cache-Control", "no-store"));
        // the token fetched in @BeforeEach opens /api/v1
        mvc.perform(get("/api/v1/catalog/icd9").header("Authorization", auth))
                .andExpect(status().isOk());
    }

    @Test
    void tokenEndpointRefusesBadCredentialsAndGrants() throws Exception {
        String wrongSecret = "Basic " + Base64.getEncoder().encodeToString(
                "medcode-mock-client:nope".getBytes(StandardCharsets.UTF_8));
        mvc.perform(post("/auth/token").header("Authorization", wrongSecret)
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .content("grant_type=client_credentials"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("unauthorized"));
        // credentials only count in the Basic header, never in the body
        mvc.perform(post("/auth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .content("grant_type=client_credentials&client_id=medcode-mock-client"
                                + "&client_secret=medcode-mock-secret"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/auth/token").header("Authorization", BASIC)
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .content("grant_type=password"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("STATUS_BUSINESS_ERROR"));
    }

    @Test
    void expiredTokenIsRefused() throws Exception {
        String expired = tokens.issue(Duration.ofSeconds(-1));
        mvc.perform(get("/api/v1/catalog/icd10").header("Authorization", "Bearer " + expired))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("unauthorized"));
    }

    // ---- /api/v1/diagnosis validation ---------------------------------------

    @Test
    void postRejectsUnknownVisitAndBadShapes() throws Exception {
        // unknown visit
        mvc.perform(post("/api/v1/diagnosis").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"request_id":"%s","object_id":"no-such-visit","fix_visit_type_id":"IPD",
                         "doctor_discharge":"1","diagnosis_icd10":[],"diagnosis_icd9":[],
                         "doctor_discharge_ipd":{"fix_ipd_discharge_status_id":"S1",
                           "fix_ipd_discharge_type_id":"T1","is_from":"MED_DC"}}"""
                        .formatted(rid("no-such-visit"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("STATUS_BUSINESS_ERROR"))
                .andExpect(jsonPath("$.message").value("invalid_request"));

        // POST rows must not carry object_id
        mvc.perform(post("/api/v1/diagnosis").header("Authorization", auth)
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
        mvc.perform(post("/api/v1/diagnosis").header("Authorization", auth)
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

        // POST one diagnosis (one kind per POST, per the guide), ids generated
        JsonNode created = postDiagnosis(rid(), "U07.1", "COVID-19", "approved");
        assertEquals("STATUS_SUCCESS", created.get("status").asString());
        String dxId = created.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        String dcId = created.get("result").get("doctor_discharge_ipd").get("object_id").asString();
        assertTrue(dxId.startsWith("DX10-") && dcId.startsWith("DCI-"));
        assertEquals(0, created.get("result").get("diagnosis_icd9").size(), "the other kind is []");
        assertTrue(created.get("mock") == null, "this mock's writes are real — never mock: true");

        // …and one procedure, with an operation window
        JsonNode proc = postProcedure(rid(), "93.90", "CPAP therapy", "2026-07-24", "08:00:00");
        String pxId = proc.get("result").get("diagnosis_icd9").get(0).get("object_id").asString();
        assertTrue(pxId.startsWith("DX9-"));

        // …the coding status the POST carried marks the visit's own extract row
        assertEquals("approved", patient(KNOWN_TN).get("coding_status").asString());
        assertEquals("approved", created.get("result").get("coding_status").asString());
        // …and the doctor's discharge column is untouched
        assertEquals(dischargeBefore, String.valueOf(patient(KNOWN_TN).get("discharge_status")));

        // created rows are visible through the reads
        assertEquals(diagsBefore + 1, caseObject(KNOWN_TN).get("diagnoses").size());
        assertEquals(procsBefore + 1, caseObject(KNOWN_TN).get("procedures").size());
        JsonNode row = findByObjectId(caseObject(KNOWN_TN).get("diagnoses"), dxId);
        assertNotNull(row, "created diagnosis is served by the read");
        assertEquals("U07.1", row.get("icd10_code").asString());
        assertEquals("PRIMARY_DIAGNOSIS", row.get("diagnosis_type").asString());
        assertEquals("2026-07-24T08:00:00+07:00", findByObjectId(
                caseObject(KNOWN_TN).get("procedures"), pxId).get("operation_start").asString());

        // PUT: edit the diagnosis by its object_id (code + type change); only
        // the array sent comes back in the result
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN).header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(putBody(rid(), """
                        "diagnosis_icd10":[{"object_id":"%s","icd10_code":"U07.2",
                          "fix_diagnosis_type_id":"COMORBIDITY"}]""".formatted(dxId))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("STATUS_SUCCESS"))
                .andExpect(jsonPath("$.result.diagnosis_icd10[0].object_id").value(dxId))
                .andExpect(jsonPath("$.result.diagnosis_icd10[0].icd10_code").value("U07.2"))
                .andExpect(jsonPath("$.result.diagnosis_icd9").doesNotExist());
        row = findByObjectId(caseObject(KNOWN_TN).get("diagnoses"), dxId);
        assertEquals("U07.2", row.get("icd10_code").asString());
        assertEquals("COMORBIDITY", row.get("diagnosis_type").asString());

        // PUT a time WITHOUT its date: lands on the stored date (the guide allows it)
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN).header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(putBody(rid(), """
                        "diagnosis_icd9":[{"object_id":"%s","time_in":"08:30:00"}]""".formatted(pxId))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.diagnosis_icd9[0].object_id").value(pxId))
                .andExpect(jsonPath("$.result.diagnosis_icd9[0].icd9_code").doesNotExist());
        assertEquals("2026-07-24T08:30:00+07:00", findByObjectId(
                caseObject(KNOWN_TN).get("procedures"), pxId).get("operation_start").asString());

        // a body carrying nothing but coding_status clears the mark (reopen),
        // and echoes "open" with no arrays
        mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN).header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(putBody(rid(), "\"coding_status\":\"open\"")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.coding_status").value("open"))
                .andExpect(jsonPath("$.result.diagnosis_icd10").doesNotExist());
        assertTrue(patient(KNOWN_TN).get("coding_status").isNull(), "reopen clears coding_status");

        // DELETE: cancel both rows — flagged, not deleted, gone from reads
        mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.cancelled").value(true))
                .andExpect(jsonPath("$.result.object_id").value(dxId))
                .andExpect(jsonPath("$.request_id").doesNotExist());
        mvc.perform(delete("/api/v1/diagnosis/{v}/icd9/{id}", KNOWN_TN, pxId)
                .header("Authorization", auth))
                .andExpect(status().isOk());
        assertEquals(diagsBefore, caseObject(KNOWN_TN).get("diagnoses").size());
        assertEquals(procsBefore, caseObject(KNOWN_TN).get("procedures").size());

        // cancel is idempotent
        mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.cancelled").value(true));
    }

    /** The guide's 400 rules for POST — each one refused on its own. */
    @Test
    void postEnforcesTheGuidesRules() throws Exception {
        String goodRow = """
                {"icd10_code":"A09","icd10_description":"Diarrhoea","beginning_diagnosis":"Diarrhoea",
                 "fix_diagnosis_type_id":"PRIMARY_DIAGNOSIS","fix_dx_source":"MED_DC",
                 "coder_eid":"coder@example.org"}""";
        String goodProc = """
                {"icd9_code":"89.7","fix_operation_type_id":"GENERAL_OPERATION","is_from":"MED_DC"}""";
        // a field outside the guide's set (the PDF's doctor_eid)
        expect400(postBody(rid(), "[" + goodRow.replace("\"coder_eid\"",
                "\"doctor_eid\":\"EMP1\",\"coder_eid\"") + "]", "[]"), "doctor_eid");
        // both kinds in one POST
        expect400(postBody(rid(), "[" + goodRow + "]", "[" + goodProc + "]"), "exactly one");
        // neither kind
        expect400(postBody(rid(), "[]", "[]"), "exactly one");
        // the other array omitted instead of []
        expect400(postBody(rid(), "[" + goodRow + "]", null), "both required");
        // fix_dx_source must be MED_DC, coder_eid required
        expect400(postBody(rid(), "[" + goodRow.replace("\"MED_DC\"", "\"OPD\"") + "]", "[]"),
                "fix_dx_source");
        expect400(postBody(rid(), """
                [{"icd10_code":"A09","fix_diagnosis_type_id":"PRIMARY_DIAGNOSIS",
                  "fix_dx_source":"MED_DC"}]""", "[]"), "coder_eid");
        // description pair must match
        expect400(postBody(rid(), "[" + goodRow.replace("\"beginning_diagnosis\":\"Diarrhoea\"",
                "\"beginning_diagnosis\":\"Gastroenteritis\"") + "]", "[]"), "same text");
        // an empty string is not an omission
        expect400(postBody(rid(), "[" + goodRow.replace("\"icd10_description\":\"Diarrhoea\"",
                "\"icd10_description\":\"\"") + "]", "[]"), "non-blank");
        // ICD-9: operation type from the guide's four, a time needs its date, real dates only
        expect400(postBody(rid(), "[]", "[" + goodProc.replace("GENERAL_OPERATION", "SURGERY") + "]"),
                "fix_operation_type_id");
        expect400(postBody(rid(), "[]", "[" + goodProc.replace("}", ",\"time_in\":\"08:00:00\"}") + "]"),
                "time_in needs date_in");
        expect400(postBody(rid(), "[]", "[" + goodProc.replace("}", ",\"date_in\":\"2026-02-30\"}") + "]"),
                "real YYYY-MM-DD");
        // request_id must be MCAI-<this visit>-<UUID v4>
        expect400(postBody("TEST-" + UUID.randomUUID(), "[" + goodRow + "]", "[]"), "request_id");
        expect400(postBody(rid("87000000000000000000"), "[" + goodRow + "]", "[]"), "request_id");
        // broken JSON is a 400 in the guide's envelope too
        mvc.perform(post("/api/v1/diagnosis").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"request_id\":"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("STATUS_BUSINESS_ERROR"));
    }

    /** The guide's 400 rules for PUT. */
    @Test
    void putEnforcesTheGuidesRules() throws Exception {
        // the other kind sent as [] (that's POST's convention, not PUT's)
        expect400Put(putBody(rid(), "\"diagnosis_icd10\":[]"), "at least one row");
        // a row with nothing to change
        expect400Put(putBody(rid(), "\"diagnosis_icd10\":[{\"object_id\":\"DX10-X\"}]"),
                "nothing to change");
        // envelope only — no rows and no status
        expect400Put(putBody(rid(), null), "nothing to update");
        // the create-only operation type
        expect400Put(putBody(rid(), """
                "diagnosis_icd9":[{"object_id":"DX9-X","fix_operation_type_id":"OTH"}]"""),
                "not accepted");
        // discharge objects belong to POST
        expect400Put(putBody(rid(), """
                "doctor_discharge_ipd":{"fix_ipd_discharge_status_id":"S2"}"""), "discharge");
        // an unknown coding status word
        expect400Put(putBody(rid(), "\"coding_status\":\"halfway\""), "coding_status");
        // a row missing object_id
        expect400Put(putBody(rid(), "\"diagnosis_icd10\":[{\"icd10_code\":\"A00\"}]"),
                "object_id");
    }

    private void expect400(String body, String detailContains) throws Exception {
        String resp = mvc.perform(post("/api/v1/diagnosis").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("STATUS_BUSINESS_ERROR"))
                .andExpect(jsonPath("$.message").value("invalid_request"))
                .andReturn().getResponse().getContentAsString();
        if (detailContains != null) {
            String detail = json.readTree(resp).get("detail").asString();
            assertTrue(detail.contains(detailContains), "expected '" + detailContains + "' in: " + detail);
        }
    }

    private void expect400Put(String body, String detailContains) throws Exception {
        String resp = mvc.perform(put("/api/v1/diagnosis/{v}", KNOWN_TN).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("STATUS_BUSINESS_ERROR"))
                .andReturn().getResponse().getContentAsString();
        String detail = json.readTree(resp).get("detail").asString();
        assertTrue(detail.contains(detailContains), "expected '" + detailContains + "' in: " + detail);
    }

    /** An IPD POST envelope for KNOWN_TN; a null icd9 array leaves the key out. */
    private static String postBody(String requestId, String icd10Rows, String icd9Rows) {
        return """
                {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                 "doctor_discharge":"1","diagnosis_icd10":%s,%s
                 "doctor_discharge_ipd":{"fix_ipd_discharge_status_id":"IPD_STATUS_1",
                   "fix_ipd_discharge_type_id":"IPD_TYPE_1","is_from":"MED_DC"}}"""
                .formatted(requestId, KNOWN_TN, icd10Rows,
                        icd9Rows == null ? "" : "\"diagnosis_icd9\":" + icd9Rows + ",");
    }

    /** A PUT envelope for KNOWN_TN plus the given JSON members (null = envelope only). */
    private static String putBody(String requestId, String members) {
        return """
                {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                 "doctor_discharge":"1"%s}"""
                .formatted(requestId, KNOWN_TN, members == null ? "" : "," + members);
    }

    @Test
    void duplicateIcd10CodeIs409() throws Exception {
        JsonNode created = postDiagnosis(rid(), "J96.0", "Acute respiratory failure");
        String dxId = created.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        try {
            mvc.perform(post("/api/v1/diagnosis").header("Authorization", auth)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(icd10Body(rid(), "J96.0", "dup")))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.message").value("DIAGNOSIS_CODE_ALREADY_EXIST"));
        } finally { // cancel so re-runs and other tests see a clean read state
            mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                    .header("Authorization", auth)).andExpect(status().isOk());
        }
    }

    @Test
    void replayedRequestIdReturnsStoredResponseWithoutReExecuting() throws Exception {
        String requestId = rid();
        JsonNode first = postDiagnosis(requestId, "B34.9", "Viral infection");
        String dxId = first.get("result").get("diagnosis_icd10").get(0).get("object_id").asString();
        try {
            int after = caseObject(KNOWN_TN).get("diagnoses").size();
            // same request_id replayed: same body back, nothing inserted twice
            JsonNode second = postDiagnosis(requestId, "B34.9", "Viral infection");
            assertEquals(first, second, "replay must return the stored response verbatim");
            assertEquals(after, caseObject(KNOWN_TN).get("diagnoses").size(),
                    "replay must not re-execute the insert");
        } finally {
            mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, dxId)
                    .header("Authorization", auth)).andExpect(status().isOk());
        }
    }

    // ---- published contract -------------------------------------------------

    /** The published contract: generated from the code, so it cannot drift. */
    @Test
    void openApiDocumentCoversEveryEndpoint() throws Exception {
        JsonNode doc = getJson("/v3/api-docs");
        JsonNode paths = doc.get("paths");
        for (String p : new String[]{
                "/auth/token", "/api/v1/cases/sync", "/api/v1/cases/sync-by-period",
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
        assertTrue(paths.get("/api/v1/cases/check") == null,
                "the parked update-check route must not be published");
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

    /** POST one ICD-10 row with IPD discharge; returns the envelope. */
    private JsonNode postDiagnosis(String requestId, String icd10, String dxName) throws Exception {
        return postDiagnosis(requestId, icd10, dxName, null);
    }

    /**
     * …optionally carrying coding_status. Tests that don't assert on it pass
     * null DELIBERATELY: this suite writes to the live demo `imed` database,
     * and a marked visit reads as an approved case in the hospital DB that
     * medcode knows nothing about. Only the round-trip test sets it, and that
     * test clears it again before finishing.
     */
    private JsonNode postDiagnosis(String requestId, String icd10, String dxName,
            String codingStatus) throws Exception {
        String statusPart = codingStatus == null
                ? ""
                : "\"coding_status\":\"%s\",".formatted(codingStatus);
        String body = """
                {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                 "doctor_discharge":"1",%s
                 "diagnosis_icd10":[{"icd10_code":"%s","icd10_description":"%s",
                   "beginning_diagnosis":"%s","fix_diagnosis_type_id":"PRIMARY_DIAGNOSIS",
                   "fix_dx_source":"MED_DC","coder_eid":"web.coder"}],
                 "diagnosis_icd9":[],
                 "doctor_discharge_ipd":{"fix_ipd_discharge_status_id":"IPD_STATUS_1",
                   "fix_ipd_discharge_type_id":"IPD_TYPE_1","is_from":"MED_DC"}}"""
                .formatted(requestId, KNOWN_TN, statusPart, icd10, dxName, dxName);
        return postOk(body);
    }

    /** POST one ICD-9 row (with a start date/time) and IPD discharge. */
    private JsonNode postProcedure(String requestId, String icd9, String opName, String dateIn,
            String timeIn) throws Exception {
        String body = """
                {"request_id":"%s","object_id":"%s","fix_visit_type_id":"IPD",
                 "doctor_discharge":"1","diagnosis_icd10":[],
                 "diagnosis_icd9":[{"icd9_code":"%s","icd9_description":"%s",
                   "beginning_operation":"%s","fix_operation_type_id":"GENERAL_OPERATION",
                   "is_from":"MED_DC","date_in":"%s","time_in":"%s"}],
                 "doctor_discharge_ipd":{"fix_ipd_discharge_status_id":"IPD_STATUS_1",
                   "fix_ipd_discharge_type_id":"IPD_TYPE_1","is_from":"MED_DC"}}"""
                .formatted(requestId, KNOWN_TN, icd9, opName, opName, dateIn, timeIn);
        return postOk(body);
    }

    private JsonNode postOk(String body) throws Exception {
        String resp = mvc.perform(post("/api/v1/diagnosis").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(resp);
    }

    // ---- contract reads (R2-R6) ---------------------------------------------

    @Test
    void updateCheckRouteIsGone() throws Exception {
        // the hospital parked POST /cases/check; clients re-read saved ids via /cases/sync
        mvc.perform(post("/api/v1/cases/check").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"changed_since\":\"2000-01-01T00:00:00\"}"))
                .andExpect(status().isNotFound());
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

        // ISO 8601 with the hospital's offset on the wire, as the guide serves it;
        // the extract stores "YYYY-MM-DD HH:MM:SS" (local, zoneless)
        String recordedAt = c.get("documents").get(0).get("recorded_at").asString();
        assertEquals('T', recordedAt.charAt(10), "date-times are ISO 8601: " + recordedAt);
        assertTrue(recordedAt.endsWith("+07:00"), "date-times carry +07:00: " + recordedAt);
        assertTrue(visit.get("last_changed_at").asString().endsWith("+07:00"));
        // sex is the guide's one-letter code; the extract says female/male
        String sex = visit.get("sex").asString();
        assertTrue(sex.equals("F") || sex.equals("M"), "sex is F or M, got " + sex);
        assertTrue(c.get("lab_results").get(0).has("panel_name"), "lab rows keep the panel fields");
    }

    @Test
    void syncByIdsRefusesMoreThanTheBatchCap() throws Exception {
        StringBuilder ids = new StringBuilder();
        for (int i = 0; i <= 20; i++) { // one over the cap
            ids.append(i == 0 ? "" : ",").append("\"V").append(i).append("\"");
        }
        mvc.perform(post("/api/v1/cases/sync").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visit_ids\":[" + ids + "]}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.message").value("too_many_visit_ids"));
        // at least one id, and every id a non-blank string
        for (String bad : new String[]{"[]", "[\"\"]", "[1]"}) {
            mvc.perform(post("/api/v1/cases/sync").header("Authorization", auth)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"visit_ids\":" + bad + "}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value("STATUS_BUSINESS_ERROR"));
        }
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

        // the same day, asked with offsets: +07:00 explicitly, and in UTC
        JsonNode bkk = postV1Json("/api/v1/cases/sync-by-period",
                "{\"from\":\"2026-07-24T00:00:00+07:00\",\"to\":\"2026-07-24T23:59:59+07:00\"}");
        JsonNode utc = postV1Json("/api/v1/cases/sync-by-period",
                "{\"from\":\"2026-07-23T17:00:00Z\",\"to\":\"2026-07-24T16:59:59Z\"}");
        assertEquals(day.get("cases").size(), bkk.get("cases").size());
        assertEquals(day.get("cases").size(), utc.get("cases").size(),
                "a UTC bound is converted to hospital time before filtering");

        // a window that runs backwards is a 400, not an empty answer
        mvc.perform(post("/api/v1/cases/sync-by-period").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"from\":\"2026-07-25T00:00:00+07:00\",\"to\":\"2026-07-24T00:00:00+07:00\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("STATUS_BUSINESS_ERROR"));

        mvc.perform(post("/api/v1/cases/sync-by-period").header("Authorization", auth)
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

        // required_fields: a non-empty array of non-blank strings
        mvc.perform(post("/api/v1/contract/check").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"required_fields\":[]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void catalogRowsAreCodeAndDescriptionOnly() throws Exception {
        JsonNode ten = getV1Json("/api/v1/catalog/icd10");
        JsonNode nine = getV1Json("/api/v1/catalog/icd9");
        assertTrue(ten.size() > 0 && nine.size() > 0, "a bare array, no data/cases wrapper");
        for (JsonNode row : new JsonNode[]{ten.get(0), nine.get(0)}) {
            assertTrue(row.has("code") && row.has("description"));
            assertEquals(2, row.size(), "the guide serves no edition key: " + row);
        }
    }

    @Test
    void contractReadsRequireBearerToken() throws Exception {
        mvc.perform(post("/api/v1/cases/sync").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visit_ids\":[\"" + KNOWN_TN + "\"]}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/catalog/icd10")).andExpect(status().isUnauthorized());
    }

    @Test
    void cancelledCodeRowsNeverComeBackThroughTheContractRead() throws Exception {
        String rid = rid();
        String created = postDiagnosis(rid, "J18.9", "Pneumonia probe")
                .get("result").get("diagnosis_icd10").get(0).get("object_id").asString();

        assertNotNull(findByObjectId(caseObject(KNOWN_TN).get("diagnoses"), created),
                "a created row is visible to R2");

        mvc.perform(delete("/api/v1/diagnosis/{v}/icd10/{id}", KNOWN_TN, created)
                .header("Authorization", auth)).andExpect(status().isOk());

        assertTrue(findByObjectId(caseObject(KNOWN_TN).get("diagnoses"), created) == null,
                "a cancelled row must never reappear — it would resurrect a code the coder removed");
    }

    private String icd10Body(String requestId, String icd10, String dxName) {
        return postBody(requestId, """
                [{"icd10_code":"%s","icd10_description":"%s","beginning_diagnosis":"%s",
                  "fix_diagnosis_type_id":"PRIMARY_DIAGNOSIS","fix_dx_source":"MED_DC",
                  "coder_eid":"web.coder"}]""".formatted(icd10, dxName, dxName), "[]");
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
        return json.readTree(mvc.perform(post(url).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode getV1Json(String url) throws Exception {
        return json.readTree(mvc.perform(get(url).header("Authorization", auth))
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
