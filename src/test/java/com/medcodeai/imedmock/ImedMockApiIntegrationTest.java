package com.medcodeai.imedmock;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Drives the mock hospital API against the local seeded "imed" Postgres
 * (see scripts/seed_local_imed_pg.sh) — no test containers, no mocks.
 * KNOWN_TN is a real extract case with diagnosis rows and no coding status in
 * the baseline, so the coding-result round trip is self-resetting.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ImedMockApiIntegrationTest {

    private static final String KNOWN_TN = "87026040104025824801";

    @Autowired
    private MockMvc mvc;

    private final JsonMapper json = new JsonMapper();

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
    void unknownCaseIs404() throws Exception {
        mvc.perform(get("/api/cases/does-not-exist/medical-records")).andExpect(status().isNotFound());
        mvc.perform(get("/api/cases/does-not-exist/coding-status")).andExpect(status().isNotFound());
    }

    @Test
    void codeIdsWithoutMcaiPrefixAreRejected() throws Exception {
        mvc.perform(put("/api/cases/{tn}/coding-result", KNOWN_TN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"approved","finalizedAt":"2026-07-22 12:00:00","updatedBy":"web.coder",
                                 "encounterType":"0","codes":[{"id":"raw-1","icd":"A00","name":"x","type":"diagnosis"}]}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("every code needs an id prefixed 'MCAI-'"));
    }

    @Test
    void codingResultRoundTrip() throws Exception {
        // self-reset: DELETE is idempotent, so start from the uncoded state
        mvc.perform(delete("/api/cases/{tn}/coding-result", KNOWN_TN)).andExpect(status().isOk());
        mvc.perform(get("/api/cases/{tn}/coding-status", KNOWN_TN)).andExpect(status().isNotFound());

        // submit: one diagnosis + one procedure
        mvc.perform(put("/api/cases/{tn}/coding-result", KNOWN_TN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"approved","finalizedAt":"2026-07-22 12:00:00","updatedBy":"web.coder",
                                 "encounterType":"0","codes":[
                                   {"id":"MCAI-t1","icd":"E11.9","name":"Type 2 diabetes","type":"diagnosis","diagnosisType":"PRIMARY_DIAGNOSIS"},
                                   {"id":"MCAI-t2","icd":"39.95","name":"Hemodialysis","type":"procedure"}]}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.statusRows").value(1))
                .andExpect(jsonPath("$.codeRows").value(2));

        mvc.perform(get("/api/cases/{tn}/coding-status", KNOWN_TN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coding_status").value("approved"))
                .andExpect(jsonPath("$.updated_by").value("web.coder"));
        assertEquals(1, countMcai(getJson("/api/cases/" + KNOWN_TN + "/diagnoses")));
        assertEquals(1, countMcai(getJson("/api/cases/" + KNOWN_TN + "/procedures")));

        // re-submit replaces, never appends
        mvc.perform(put("/api/cases/{tn}/coding-result", KNOWN_TN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"approved","finalizedAt":"2026-07-22 12:01:00","updatedBy":"web.coder",
                                 "encounterType":"0","codes":[
                                   {"id":"MCAI-t3","icd":"E11.9","name":"Type 2 diabetes","type":"diagnosis","diagnosisType":"PRIMARY_DIAGNOSIS"}]}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.codeRows").value(1));
        assertEquals(1, countMcai(getJson("/api/cases/" + KNOWN_TN + "/diagnoses")));
        assertEquals(0, countMcai(getJson("/api/cases/" + KNOWN_TN + "/procedures")));

        // reopen clears everything we wrote
        mvc.perform(delete("/api/cases/{tn}/coding-result", KNOWN_TN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
        mvc.perform(get("/api/cases/{tn}/coding-status", KNOWN_TN)).andExpect(status().isNotFound());
        assertEquals(0, countMcai(getJson("/api/cases/" + KNOWN_TN + "/diagnoses")));
    }

    private int countMcai(JsonNode rows) {
        int n = 0;
        for (JsonNode r : rows) {
            JsonNode id = r.get("id");
            if (id != null && !id.isNull() && id.asString().startsWith("MCAI-")) {
                n++;
            }
        }
        return n;
    }

    private JsonNode getJson(String url) throws Exception {
        String body = mvc.perform(get(url))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }
}
