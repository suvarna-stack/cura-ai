package com.medcodeai.api.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Drives the real read/write/approve/reopen endpoints against the local
 * seeded "medcode" Postgres (no test containers, no mocks) — the project's
 * correctness gate. PREREQUISITE: imed-mock-api must be running on :8003
 * (or IMED_API_BASE) — approve/reopen send the hospital calls for real
 * (cd ../imed-mock-api && ./mvnw spring-boot:run).
 *
 * Validates this backend's own contract (docs/api-contract.md), not Flask
 * parity: confidence/patient/hn/dates/revenue_impact/coder come from real DB
 * values, null where no real source exists (see CLAUDE.md, 2026-07-22).
 *
 * Since Phase 3 (2026-07-25) the whole case surface requires a login token;
 * these tests authenticate as the bootstrap admin and the approve/reopen
 * actor is that account (body `coder` fields are ignored by the API now).
 */
@SpringBootTest
@AutoConfigureMockMvc
class CasesApiIntegrationTest {

    // known ids from the seeded POC baseline data
    private static final String KNOWN_CASE_ID = "87026040104025824801";
    private static final String APPROVABLE_CASE_ID = "87026041010043786701"; // complete, not approved

    private static final String ADMIN_EMAIL = "admin@medcodeai.demo";
    private static final String ADMIN_PW = "admin1234"; // SchemaBootstrap's documented default

    @Autowired
    private MockMvc mvc;

    private final JsonMapper json = new JsonMapper();

    private String cachedAuth;

    /** "Bearer <token>" for the bootstrap admin, logged in once per test run. */
    private String auth() throws Exception {
        if (cachedAuth == null) {
            String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"" + ADMIN_EMAIL + "\",\"password\":\"" + ADMIN_PW + "\"}"))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            cachedAuth = "Bearer " + json.readTree(body).get("token").asString();
        }
        return cachedAuth;
    }

    @Test
    void healthzReportsRealDbCount() throws Exception {
        // health stays public — uptime pingers carry no token
        mvc.perform(get("/api/healthz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.db").value("pg"));
    }

    @Test
    void caseEndpointsRequireALoginToken() throws Exception {
        // Phase 3: the case surface is guarded — no token, no data
        mvc.perform(get("/api/cases"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
        mvc.perform(post("/api/cases/approve").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + APPROVABLE_CASE_ID + "\"]}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/sync"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void casesJsonHasExpectedShape() throws Exception {
        JsonNode root = getJson("/api/cases");
        assertTrue(root.has("stats"));
        assertTrue(root.get("stats").has("reopened"));
        assertTrue(root.get("complete").isArray());
        assertTrue(root.get("incompleteGroups").isArray());
        assertTrue(root.get("reopened").isArray());
        assertTrue(root.get("finished").isArray());
    }

    @Test
    void listedCasesHaveRealValuesNotPlaceholders() throws Exception {
        JsonNode root = getJson("/api/cases");
        JsonNode sample = firstListedCase(root);
        assertNotNull(sample, "expected at least one case in the dashboard payload");
        assertTrue(sample.get("patient").isNull(), "no real patient-name source exists yet");
        assertTrue(sample.get("confidence").isNull(), "no real AI-confidence source exists yet");
        assertTrue(sample.get("revenue_impact").isNull(), "no real revenue source exists yet");
    }

    @Test
    void finishedCasesShowRealCoderIdNotRotatedFakeName() throws Exception {
        JsonNode finished = getJson("/api/cases").get("finished");
        assertTrue(finished.size() > 0, "expected at least one already-approved case in the seed data");
        String coder = finished.get(0).get("coder").asString();
        // real actor ids: the seed's demo.coder/web.coder, or (since Phase 3)
        // an authenticated account's email
        assertTrue(coder.equals("demo.coder") || coder.equals("web.coder") || coder.contains("@"),
                "coder should be a real actor id (" + coder + "), not a rotated fake display name");
    }

    @Test
    void caseDetailUnknownIdReturns404() throws Exception {
        mvc.perform(get("/api/cases/does-not-exist").header("Authorization", auth()))
                .andExpect(status().isNotFound());
    }

    @Test
    void caseDetailKnownIdIncludesWorkingState() throws Exception {
        // codeEdits/reportDraft are always present, JSON null when unset —
        // check key presence directly rather than via jsonPath().exists()
        // (which treats a null leaf as absent).
        JsonNode detail = getJson("/api/cases/" + KNOWN_CASE_ID);
        assertTrue(KNOWN_CASE_ID.equals(detail.get("case").get("case_id").asString()));
        assertTrue(detail.has("codeEdits"));
        assertTrue(detail.has("reportDraft"));
        // history is always present — an array, empty when the case has no
        // coder actions yet (the frontend's ViewHistoryPage reads it)
        assertTrue(detail.has("history"));
        assertTrue(detail.get("history").isArray());
    }

    @Test
    void caseDetailServesRealHospitalValues() throws Exception {
        // positive check on the contract's field <-> real-column mapping:
        // KNOWN_CASE_ID is an IPD visit whose extract row carries these values
        // verbatim (the frozen db/seed.sql.gz baseline)
        mvc.perform(get("/api/cases/{id}", KNOWN_CASE_ID).header("Authorization", auth()))
                .andExpect(jsonPath("$.case.patient_ref").value("690003026"))
                .andExpect(jsonPath("$.case.admissiondatetime").value("2026-04-01 06:45:00"))
                .andExpect(jsonPath("$.case.dischargedatetime").value("2026-04-10 16:22:41"))
                .andExpect(jsonPath("$.case.encountertype").value("1"));
    }

    @Test
    void caseDetailIncludesServerHistoryForApprovedCase() throws Exception {
        // finished cases were approved in the frozen seed, so their detail
        // carries a populated `history` array (the coder audit trail); each
        // entry is {action, coder, at} with a known coder action. Pure read —
        // no imed-mock needed, unlike the approve round-trip.
        String approvedId = getJson("/api/cases").get("finished").get(0).get("id").asString();
        JsonNode history = getJson("/api/cases/" + approvedId).get("history");
        assertTrue(history.isArray() && history.size() > 0,
                "an approved case's detail should carry a non-empty history");
        JsonNode h0 = history.get(0);
        assertTrue(h0.has("action") && h0.has("coder") && h0.has("at"),
                "each history entry has action, coder, at");
        assertTrue(List.of("approved_single", "approved_group", "approved_all", "reopened", "code_assigned")
                        .contains(h0.get("action").asString()),
                "history action should be a known coder action, got " + h0.get("action").asString());
    }

    @Test
    void putDraftThenReadBackReflectsIt() throws Exception {
        mvc.perform(put("/api/cases/{id}/draft", KNOWN_CASE_ID).header("Authorization", auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"integration test draft\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        mvc.perform(get("/api/cases/{id}", KNOWN_CASE_ID).header("Authorization", auth()))
                .andExpect(jsonPath("$.reportDraft").value("integration test draft"));
    }

    @Test
    void approveThenReopenRoundTripsAndInvalidatesCache() throws Exception {
        // stats shape per docs/api-contract.md: one case, no saved edits ->
        // the imported principal is re-confirmed (1 code) + 1 status row.
        // mcai_code_rows counts hospital DIFF writes (2026-07-24): the
        // re-confirmed principal already exists at the hospital unchanged,
        // so the diff makes ZERO code writes (only the coding status is set).
        mvc.perform(post("/api/cases/approve").header("Authorization", auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + APPROVABLE_CASE_ID + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approved[0]").value(APPROVABLE_CASE_ID))
                .andExpect(jsonPath("$.notFound").isEmpty())
                .andExpect(jsonPath("$.stats.cases_finalized").value(1))
                .andExpect(jsonPath("$.stats.status_rows").value(1))
                .andExpect(jsonPath("$.stats.mcai_code_rows").value(0));

        JsonNode afterApprove = getJson("/api/cases");
        assertTrue(containsCaseId(afterApprove.get("finished"), APPROVABLE_CASE_ID),
                "approved case should move into the finished queue (cache must invalidate)");

        mvc.perform(post("/api/cases/{id}/reopen", APPROVABLE_CASE_ID).header("Authorization", auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        JsonNode afterReopen = getJson("/api/cases");
        assertFalse(containsCaseId(afterReopen.get("finished"), APPROVABLE_CASE_ID),
                "reopened case should leave the finished queue");
        // reopened is a first-class EXCLUSIVE queue (2026-07-24): the case moves
        // there, not back into complete, until it is re-approved
        assertTrue(containsCaseId(afterReopen.get("reopened"), APPROVABLE_CASE_ID),
                "reopened case should enter the reopened queue");
        assertFalse(containsCaseId(afterReopen.get("complete"), APPROVABLE_CASE_ID),
                "reopened case must not stay in the complete list");
    }

    // ---- sync (pull from the hospital) ----
    // Exercised through the per-case route: it drives the SAME SyncService engine
    // as bulk POST /api/sync but touches one case, so the suite stays fast and
    // doesn't rewrite the whole shared seed. Assertions stay on outcome/status
    // (not refreshed field values) per the contract's isolation note.

    @Test
    void syncRefreshesAnOpenCaseWithoutChangingItsStatus() throws Exception {
        // a "complete" dashboard case is complete-but-not-approved = open
        String openId = getJson("/api/cases").get("complete").get(0).get("id").asString();

        JsonNode r = postJson("/api/cases/" + openId + "/sync");
        assertTrue(r.get("ok").asBoolean());
        assertTrue(containsString(r.get("refreshed"), openId), "an open case should refresh");
        assertTrue(r.get("imported").isEmpty(), "already-present case is not a new import");
        assertTrue(r.get("skippedApproved").isEmpty());
        assertTrue(r.get("failed").isEmpty(), "no case should fail against the seeded hospital");

        // idempotent + non-destructive: re-pull keeps it open
        postJson("/api/cases/" + openId + "/sync");
        assertTrue("open".equals(getJson("/api/cases/" + openId).get("case").get("case_status").asString()),
                "sync must never change a case's workflow status");
    }

    @Test
    void syncSkipsAnApprovedCase() throws Exception {
        String approvedId = getJson("/api/cases").get("finished").get(0).get("id").asString();

        JsonNode r = postJson("/api/cases/" + approvedId + "/sync");
        assertTrue(containsString(r.get("skippedApproved"), approvedId),
                "an approved case must be protected from sync, not rebuilt");
        assertTrue(r.get("refreshed").isEmpty());
        assertTrue(r.get("imported").isEmpty());
    }

    @Test
    void syncUnknownCaseReturns404() throws Exception {
        mvc.perform(post("/api/cases/does-not-exist/sync").header("Authorization", auth()))
                .andExpect(status().isNotFound());
    }

    private JsonNode postJson(String url) throws Exception {
        String body = mvc.perform(post(url).header("Authorization", auth()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private boolean containsString(JsonNode arr, String value) {
        for (JsonNode n : arr) {
            if (value.equals(n.asString())) {
                return true;
            }
        }
        return false;
    }

    private JsonNode getJson(String url) throws Exception {
        String body = mvc.perform(get(url).header("Authorization", auth()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private JsonNode firstListedCase(JsonNode root) {
        for (String bucket : List.of("complete", "finished")) {
            JsonNode arr = root.get(bucket);
            if (arr != null && !arr.isEmpty()) {
                return arr.get(0);
            }
        }
        for (JsonNode group : root.get("incompleteGroups")) {
            JsonNode cases = group.get("cases");
            if (cases != null && !cases.isEmpty()) {
                return cases.get(0);
            }
        }
        return null;
    }

    private boolean containsCaseId(JsonNode arr, String caseId) {
        for (JsonNode n : arr) {
            if (caseId.equals(n.get("id").asString())) {
                return true;
            }
        }
        return false;
    }
}
