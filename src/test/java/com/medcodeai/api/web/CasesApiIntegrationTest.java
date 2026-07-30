package com.medcodeai.api.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

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
        assertTrue(sample.get("confidence").isNull() || sample.get("confidence").isNumber(),
                "confidence is null until RAG suggestions are saved, then an integer average");
        assertTrue(sample.get("revenue_impact").isNull(), "no real revenue source exists yet");
    }

    @Test
    void listedCasesCarryOrderNamesBehindEveryOrderCount() throws Exception {
        // contract addition 2026-07-27: `orderNames` names the items behind the
        // `orders` counts (the dashboard's nested Study/Item filter reads it).
        // Both keys are always present; the name lists are distinct + A–Z.
        JsonNode root = getJson("/api/cases");
        JsonNode withOrders = null;
        for (JsonNode c : root.get("complete")) {
            assertTrue(c.has("orderNames"), "every card carries orderNames, even when empty");
            if (withOrders == null && !c.get("orders").isEmpty()) {
                withOrders = c;
            }
        }
        assertNotNull(withOrders, "expected at least one seeded case with orders");

        JsonNode names = withOrders.get("orderNames");
        assertFalse(names.isEmpty(), "a case with orders should name at least one of them");
        for (String cat : names.propertyNames()) {
            // no name list without a matching count — the two views must agree
            assertTrue(withOrders.get("orders").has(cat),
                    "orderNames category " + cat + " has no matching orders count");
            List<String> got = new ArrayList<>();
            for (JsonNode n : names.get(cat)) {
                got.add(n.asString());
            }
            assertFalse(got.isEmpty(), "an empty name list should be absent, not sent");
            assertEquals(new TreeSet<>(got).size(), got.size(), "names must be distinct: " + got);
            assertEquals(new ArrayList<>(new TreeSet<>(got)), got, "names must be A–Z: " + got);
            // a category can never name more items than it counted
            assertTrue(got.size() <= withOrders.get("orders").get(cat).asInt(),
                    "more distinct names than order rows in " + cat);
        }
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

    // ---- ICD-9 operation time window (2026-07-30) ----
    // An ICD-9 code is a procedure, and a procedure happens over a time window.
    // The hospital records it on both surfaces (extract startdatetime/enddatetime,
    // write API date_in/time_in/date_out/time_out); we carry it end-to-end.

    @Test
    void syncImportsTheHospitalOperationWindowOntoIcd9Codes() throws Exception {
        // KNOWN_CASE_ID is open with four timed procedures in the frozen imed
        // seed; the per-case sync re-imports its codes with the window attached
        postJson("/api/cases/" + KNOWN_CASE_ID + "/sync");

        JsonNode codes = getJson("/api/cases/" + KNOWN_CASE_ID).get("codes");
        boolean sawTimedIcd9 = false;
        for (JsonNode c : codes) {
            assertTrue(c.has("operation_start") && c.has("operation_end") && c.has("operation_type"),
                    "every code row carries the operation window + type keys");
            if ("ICD-10".equals(c.get("code_system").asString())) {
                assertTrue(c.get("operation_start").isNull() && c.get("operation_end").isNull()
                                && c.get("operation_type").isNull(),
                        "a diagnosis has no operation window or type");
            }
            if ("54.23".equals(c.get("code").asString())) {
                // the biopsy row's window and type, verbatim from the hospital extract
                assertEquals("2026-04-02 23:55:00", c.get("operation_start").asString());
                assertEquals("2026-04-02 05:05:00", c.get("operation_end").asString());
                assertEquals("OR Procedure", c.get("operation_type").asString());
                sawTimedIcd9 = true;
            }
        }
        assertTrue(sawTimedIcd9, "expected the imported 54.23 procedure with its hospital times");
    }

    @Test
    void syncImportsTheHospitalVitalSigns() throws Exception {
        // KNOWN_CASE_ID has vital-sign readings in the frozen imed seed; the
        // detail serves them chronologically with blanks normalized to null
        postJson("/api/cases/" + KNOWN_CASE_ID + "/sync");

        JsonNode vitals = getJson("/api/cases/" + KNOWN_CASE_ID).get("vitals");
        assertNotNull(vitals, "detail must carry a vitals array");
        assertTrue(vitals.size() > 0, "KNOWN_CASE_ID has seeded vital-sign rows");
        JsonNode reading = null;
        String prev = null;
        for (JsonNode v : vitals) {
            for (String k : List.of("measured_at", "temperature", "systolic", "diastolic",
                    "heart_rate", "oxygen_saturation", "weight", "height")) {
                assertTrue(v.has(k), "every vitals row carries the " + k + " key");
            }
            if (!v.get("measured_at").isNull()) {
                String at = v.get("measured_at").asString();
                assertTrue(prev == null || prev.compareTo(at) <= 0, "vitals sort chronologically");
                prev = at;
            }
            if ("2026-04-02 10:00:00".equals(v.get("measured_at").asString())) {
                reading = v;
            }
        }
        // one seeded reading, verbatim — and its blank columns served as null
        assertNotNull(reading, "expected the seeded 2026-04-02 10:00 reading");
        assertEquals("37", reading.get("temperature").asString());
        assertEquals("98", reading.get("systolic").asString());
        assertEquals("60", reading.get("diastolic").asString());
        assertEquals("94", reading.get("heart_rate").asString());
        assertEquals("96", reading.get("oxygen_saturation").asString());
        assertTrue(reading.get("weight").isNull() && reading.get("height").isNull(),
                "blank hospital values are normalized to null");
    }

    @Test
    void operationTimesFlowFromSavedEditsThroughApproveAndRevertOnReopen() throws Exception {
        // Coder path: save edits whose ICD-9 row carries a window (one value in
        // datetime-local form, one already normalized), approve, and the
        // materialized detail row serves both normalized. The edit list mirrors
        // the case's imported codes so the hospital diff only CREATES our new
        // procedure (reverted by reopen); saved edits are cleared in the finally
        // so the no-edits approve test keeps its re-confirm-the-principal path.
        JsonNode imported = getJson("/api/cases/" + APPROVABLE_CASE_ID).get("codes");
        List<String> entries = new ArrayList<>();
        for (JsonNode c : imported) {
            entries.add(json.writeValueAsString(java.util.Map.of(
                    "code", c.get("code").asString(),
                    "type", c.get("code_system").asString(),
                    "desc", c.get("description").isNull() ? "" : c.get("description").asString())));
        }
        // the type label is the UI's verbose vocabulary on purpose — approve
        // must resolve it to the ICD-9 catalog (it used to 500 on IcdSystem.of)
        entries.add("""
                {"code":"93.22","type":"ICD-9 Primary Diagnosis","desc":"Ambulation and gait training",
                 "operation_start":"2026-04-08T11:20","operation_end":"2026-04-08 12:05:00",
                 "operation_type":"OR Procedure"}""");
        // the UI's two other ICD-10 dropdown options (2026-07-30): "…external…"
        // → external_cause, "…other…" → other; a `note` is an internal extra
        // field — stored + echoed verbatim, never materialized or sent to iMed
        entries.add("""
                {"code":"V89.2","type":"ICD-10 External Cause","note":"MVA, per ER note",
                 "desc":"Person injured in unspecified motor-vehicle accident, traffic"}""");
        try {
            mvc.perform(put("/api/cases/{id}/codes", APPROVABLE_CASE_ID).header("Authorization", auth())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("[" + String.join(",", entries) + "]"))
                    .andExpect(status().isOk());
            mvc.perform(post("/api/cases/approve").header("Authorization", auth())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"ids\":[\"" + APPROVABLE_CASE_ID + "\"]}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.approved[0]").value(APPROVABLE_CASE_ID));

            JsonNode codes = getJson("/api/cases/" + APPROVABLE_CASE_ID).get("codes");
            JsonNode ours = null;
            JsonNode external = null;
            for (JsonNode c : codes) {
                if ("coder_assigned".equals(c.get("source").asString())
                        && "93.22".equals(c.get("code").asString())) {
                    ours = c;
                }
                if ("coder_assigned".equals(c.get("source").asString())
                        && "V89.2".equals(c.get("code").asString())) {
                    external = c;
                }
            }
            assertNotNull(ours, "the approved edit should materialize as a coder_assigned row");
            assertNotNull(external, "the external-cause edit should materialize too");
            assertEquals("external_cause", external.get("code_role").asString(),
                    "an '…external…' type label materializes with the external_cause role");
            assertEquals("2026-04-08 11:20:00", ours.get("operation_start").asString(),
                    "datetime-local input is normalized to YYYY-MM-DD HH:MM:SS");
            assertEquals("2026-04-08 12:05:00", ours.get("operation_end").asString());
            assertEquals("OR Procedure", ours.get("operation_type").asString(),
                    "the edit's operation_type materializes onto the coder_assigned row");
        } finally {
            // revert the hospital create + our coder_assigned rows…
            mvc.perform(post("/api/cases/{id}/reopen", APPROVABLE_CASE_ID).header("Authorization", auth())
                            .contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isOk());
            // …and drop the saved edits (no API clears working state; reopen keeps it)
            jdbc.update("DELETE FROM case_code_edits WHERE case_id=?", APPROVABLE_CASE_ID);
        }
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

    // ---- GET /api/icd-codes -------------------------------------------------
    // Added 2026-07-29 after the ICD-catalog split silently broke this endpoint:
    // its SQL still read the dropped `icd_codes` table, which compiles fine
    // (the table name lives in a string) and passed every test, because there
    // were none. These assert the behavior, not just that the route exists.

    // "lumbar" matches descriptions in BOTH seeded catalogs, and the codes are
    // disjoint — so asserting on the CODES (not just the system labels) pins
    // which table was actually read. Checking labels alone would pass even if
    // both branches read icd_10 and merely tagged half the rows "ICD-9", which
    // would hand the coder a mislabelled chip and write the wrong system to the
    // hospital.
    private static final String LUMBAR_ICD9 = "03.31";                  // Lumbar puncture
    private static final String LUMBAR_ICD10 = "M51.1";                 // Lumbar disc disorder

    @Test
    void icdCatalogSearchSpansBothSystems() throws Exception {
        JsonNode hits = getJson("/api/icd-codes?q=lumbar&limit=40");
        assertFalse(hits.isEmpty(), "seeded catalog should match 'lumbar'");

        for (JsonNode h : hits) {
            String system = h.get("system").asString();
            assertTrue("ICD-10".equals(system) || "ICD-9".equals(system), "unexpected system " + system);
            assertNotNull(h.get("code").asString());
            // COALESCEd server-side, so the picker never renders a null title
            assertNotNull(h.get("description").asString());
        }
        assertTrue(hasHit(hits, LUMBAR_ICD9, "ICD-9"), "the icd_9 catalog was not searched");
        assertTrue(hasHit(hits, LUMBAR_ICD10, "ICD-10"), "the icd_10 catalog was not searched");
    }

    @Test
    void icdCatalogSearchFiltersBySystem() throws Exception {
        JsonNode hits = getJson("/api/icd-codes?q=lumbar&system=ICD-9&limit=40");
        assertFalse(hits.isEmpty());
        for (JsonNode h : hits) {
            assertEquals("ICD-9", h.get("system").asString(), "system filter leaked the other catalog");
        }
        assertTrue(hasHit(hits, LUMBAR_ICD9, "ICD-9"));
        // the filter must select the TABLE, not just stamp the label
        assertFalse(hasHit(hits, LUMBAR_ICD10, "ICD-9"),
                "an ICD-10 code came back labelled ICD-9 — the filter is tagging, not filtering");
    }

    private boolean hasHit(JsonNode hits, String code, String system) {
        for (JsonNode h : hits) {
            if (code.equals(h.get("code").asString()) && system.equals(h.get("system").asString())) {
                return true;
            }
        }
        return false;
    }

    @Test
    void icdCatalogSearchRanksExactCodeFirst() throws Exception {
        // the picker is a typeahead — a coder typing a full code wants it on top
        JsonNode hits = getJson("/api/icd-codes?q=J18.9");
        assertFalse(hits.isEmpty());
        assertEquals("J18.9", hits.get(0).get("code").asString());
        assertEquals("ICD-10", hits.get(0).get("system").asString());
    }

    @Test
    void icdCatalogSearchCapsTheLimit() throws Exception {
        // cap survives the UNION — it applies to the combined set, not per table
        assertTrue(getJson("/api/icd-codes?q=a&limit=100").size() <= 40,
                "limit must be capped at 40 however large the caller asks for");
    }

    @Test
    void icdCatalogSearchRejectsBadInput() throws Exception {
        mvc.perform(get("/api/icd-codes?q=").header("Authorization", auth()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("q is required"));
        // an unknown system must 400 at the controller, NOT reach IcdSystem.of()
        // and surface as a 500
        mvc.perform(get("/api/icd-codes?q=x&system=ICD-11").header("Authorization", auth()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("system must be ICD-10 or ICD-9"));
    }

    @Test
    void icdCatalogSearchRequiresAToken() throws Exception {
        mvc.perform(get("/api/icd-codes?q=J18"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
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
