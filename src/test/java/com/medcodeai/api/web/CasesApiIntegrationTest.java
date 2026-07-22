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
 */
@SpringBootTest
@AutoConfigureMockMvc
class CasesApiIntegrationTest {

    // known ids from the seeded POC baseline data
    private static final String KNOWN_CASE_ID = "87026040104025824801";
    private static final String APPROVABLE_CASE_ID = "87026041010043786701"; // complete, not approved

    @Autowired
    private MockMvc mvc;

    private final JsonMapper json = new JsonMapper();

    @Test
    void healthzReportsRealDbCount() throws Exception {
        mvc.perform(get("/api/healthz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.db").value("pg"));
    }

    @Test
    void casesJsonHasExpectedShape() throws Exception {
        JsonNode root = getJson("/api/cases");
        assertTrue(root.has("stats"));
        assertTrue(root.get("complete").isArray());
        assertTrue(root.get("incompleteGroups").isArray());
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
        assertTrue(coder.equals("demo.coder") || coder.equals("web.coder"),
                "coder should be the real actor id (" + coder + "), not a rotated fake display name");
    }

    @Test
    void caseDetailUnknownIdReturns404() throws Exception {
        mvc.perform(get("/api/cases/does-not-exist")).andExpect(status().isNotFound());
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
    }

    @Test
    void caseDetailServesRealHospitalValues() throws Exception {
        // positive check on the contract's field <-> real-column mapping:
        // KNOWN_CASE_ID is an IPD visit whose extract row carries these values
        // verbatim (the frozen db/seed.sql.gz baseline)
        mvc.perform(get("/api/cases/{id}", KNOWN_CASE_ID))
                .andExpect(jsonPath("$.case.patient_ref").value("690003026"))
                .andExpect(jsonPath("$.case.admissiondatetime").value("2026-04-01 06:45:00"))
                .andExpect(jsonPath("$.case.dischargedatetime").value("2026-04-10 16:22:41"))
                .andExpect(jsonPath("$.case.encountertype").value("1"));
    }

    @Test
    void putDraftThenReadBackReflectsIt() throws Exception {
        mvc.perform(put("/api/cases/{id}/draft", KNOWN_CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"integration test draft\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        mvc.perform(get("/api/cases/{id}", KNOWN_CASE_ID))
                .andExpect(jsonPath("$.reportDraft").value("integration test draft"));
    }

    @Test
    void approveThenReopenRoundTripsAndInvalidatesCache() throws Exception {
        // stats shape per docs/api-contract.md: one case, no saved edits ->
        // the imported principal is re-confirmed (1 code) + 1 status row
        mvc.perform(post("/api/cases/approve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + APPROVABLE_CASE_ID + "\"],\"coder\":\"web.coder\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approved[0]").value(APPROVABLE_CASE_ID))
                .andExpect(jsonPath("$.notFound").isEmpty())
                .andExpect(jsonPath("$.stats.cases_finalized").value(1))
                .andExpect(jsonPath("$.stats.status_rows").value(1))
                .andExpect(jsonPath("$.stats.mcai_code_rows").value(1));

        JsonNode afterApprove = getJson("/api/cases");
        assertTrue(containsCaseId(afterApprove.get("finished"), APPROVABLE_CASE_ID),
                "approved case should move into the finished queue (cache must invalidate)");

        mvc.perform(post("/api/cases/{id}/reopen", APPROVABLE_CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"coder\":\"web.coder\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        JsonNode afterReopen = getJson("/api/cases");
        assertFalse(containsCaseId(afterReopen.get("finished"), APPROVABLE_CASE_ID),
                "reopened case should leave the finished queue");
    }

    private JsonNode getJson(String url) throws Exception {
        String body = mvc.perform(get(url))
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
