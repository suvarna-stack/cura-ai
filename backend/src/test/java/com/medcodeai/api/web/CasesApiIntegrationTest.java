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
import java.util.Map;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Drives the real read/write/approve/reopen endpoints against the local
 * seeded "medcode" Postgres (no test containers, no mocks) — the project's
 * correctness gate. PREREQUISITE: the hospital's iMed API must be reachable
 * at IMED_API_BASE (default :8003) — approve/reopen send the hospital calls
 * for real.
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
    // Re-based 2026-08-19 onto the curated July demo dataset. The old April
    // TNs came from the retired pre-empty-start dataset and exist in NEITHER
    // database any more, which is why 11 tests here were permanently red.
    /** The richest OPD visit: 16 note sections, 36 orders (18 lab, 3 medicine), 2 vitals. */
    private static final String KNOWN_CASE_ID = "87026072413210500101";
    /**
     * The SACRIFICIAL fixture: complete and open, and the only visit the write
     * tests approve/reopen. Those tests churn the hospital's own rows — the
     * approve diff cancels what the coder's final list drops and re-creates it
     * on reopen with fresh object_ids — so no test that asserts exact hospital
     * values may share this visit.
     */
    private static final String APPROVABLE_CASE_ID = "87026072711124400801";

    /**
     * READ-ONLY: carries a seeded ICD-9 hemorrhoidectomy with a real operation
     * window. Deliberately not the approvable case, so the window assertions
     * can't be broken by another test's write-back.
     */
    private static final String TIMED_PROCEDURE_CASE_ID = "87026072209142300201";

    private static final String ADMIN_EMAIL = "admin@medcodeai.demo";
    private static final String ADMIN_PW = "admin1234"; // AdminBootstrap's documented default

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
        // complete + reopened: a case that has been through an approve/reopen
        // cycle lives in `reopened` permanently, so scanning only `complete`
        // finds nothing on a dataset the write tests have already exercised
        for (String bucket : List.of("complete", "reopened")) {
            for (JsonNode c : root.get(bucket)) {
                assertTrue(c.has("orderNames"), "every card carries orderNames, even when empty");
                if (withOrders == null && !c.get("orders").isEmpty()) {
                    withOrders = c;
                }
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
        // The July demo dataset starts with every case open (that is the point
        // of an empty start state), so this approves one rather than depending
        // on seeded finished cases — and reopens it whatever happens, to leave
        // the demo data as it found it.
        approve(APPROVABLE_CASE_ID);
        try {
            JsonNode finished = getJson("/api/cases").get("finished");
            assertTrue(finished.size() > 0, "the case just approved should be finished");
            String coder = finished.get(0).get("coder").asString();
            // The guard this test exists for: `coder` must trace to a REAL
            // actor. CasesViewService maps a stamp to users.full_name on
            // purpose (an admin rename shows up on the coder facet), so the
            // check is "does an account actually go by this name" rather than
            // a hard-coded one — any test in the suite may have been the last
            // to touch a case. What must never appear is a per-case rotated
            // fake, which is what the deleted DeterministicFakes used to serve.
            assertTrue(coder.equals("demo.coder") || coder.equals("web.coder")
                            || coder.contains("@") || isRealAccount(coder),
                    "coder should be a real actor (" + coder + "), not a rotated fake display name");
        } finally {
            reopen(APPROVABLE_CASE_ID);
        }
    }

    @Test
    void caseDetailUnknownIdReturns404() throws Exception {
        mvc.perform(get("/api/cases/does-not-exist").header("Authorization", auth()))
                .andExpect(status().isNotFound());
    }

    @Test
    void caseDetailKnownIdIncludesWorkingState() throws Exception {
        // codeEdits is always present, JSON null when unset — check key
        // presence directly rather than via jsonPath().exists()
        // (which treats a null leaf as absent).
        JsonNode detail = getJson("/api/cases/" + KNOWN_CASE_ID);
        assertTrue(KNOWN_CASE_ID.equals(detail.get("case").get("case_id").asString()));
        assertTrue(detail.has("codeEdits"));
        assertTrue(!detail.has("reportDraft"), "report drafts were removed 2026-08-02");
        // history is always present — an array, empty when the case has no
        // coder actions yet (the frontend's ViewHistoryPage reads it)
        assertTrue(detail.has("history"));
        assertTrue(detail.get("history").isArray());
    }

    @Test
    void caseDetailServesRealHospitalValues() throws Exception {
        // positive check on the contract's field <-> real-column mapping.
        // KNOWN_CASE_ID is an OPD visit — the whole July demo dataset is OPD,
        // so patient_ref (the admission number) is legitimately null and
        // encountertype is "0". These values come from the hospital's own row.
        mvc.perform(get("/api/cases/{id}", KNOWN_CASE_ID).header("Authorization", auth()))
                .andExpect(jsonPath("$.case.encountertype").value("0"))
                .andExpect(jsonPath("$.case.sex").value("male"))
                .andExpect(jsonPath("$.case.birthdate").value("1958-11-25"))
                .andExpect(jsonPath("$.case.coverage_type").value("OFC_O3"))
                .andExpect(jsonPath("$.case.patient_ref").doesNotExist());
    }

    @Test
    void caseDetailOrdersCarryDetailJsonAndTrueCounts() throws Exception {
        // each order row serves its raw hospital source row as a `detail`
        // object — the UI's lab results table and medication chips read it.
        // Key names follow the R1-R6 contract since 2026-08-19 (item_name, not
        // itemname). The cap is 50 rows PER CATEGORY, so a lab-heavy case still
        // serves its medicine orders — the old global LIMIT 150 starved them out.
        JsonNode body = getJson("/api/cases/" + KNOWN_CASE_ID);
        JsonNode orders = body.get("orders");
        assertTrue(orders.isArray() && orders.size() > 0, "expected a non-empty orders array");
        boolean sawLabItem = false, sawMedicineQty = false;
        Map<String, Integer> perCat = new java.util.HashMap<>();
        for (JsonNode o : orders) {
            assertTrue(o.has("detail"), "every order row carries the detail key");
            perCat.merge(o.get("order_category").asString(), 1, Integer::sum);
            if ("lab".equals(o.get("order_category").asString()) && o.get("detail").isObject()) {
                sawLabItem |= o.get("detail").has("item_name") && o.get("detail").has("value");
            }
            if ("medicine".equals(o.get("order_category").asString()) && o.get("detail").isObject()
                    && o.get("detail").hasNonNull("quantity")) {
                // negative = a return/credit row (seed data really has "-6")
                assertTrue(o.get("detail").get("quantity").asString().matches("-?\\d+"),
                        "quantity is raw integer text, got " + o.get("detail").get("quantity"));
                sawMedicineQty = true;
            }
        }
        assertTrue(sawLabItem, "expected a lab row with item_name/value in its detail");
        assertTrue(sawMedicineQty, "expected a medicine order with a quantity in its detail");
        perCat.forEach((cat, n) ->
                assertTrue(n <= 50, "per-category cap: " + cat + " served " + n + " rows"));
        // No case in the July dataset has more than 50 labs, so the cap can only
        // be asserted as an upper bound here; orderCounts below proves the
        // count is the TRUE total rather than the capped page.
        assertTrue(perCat.getOrDefault("lab", 0) > 0, "the known case has lab orders");

        // orderCounts = true totals per category, immune to the per-category cap
        JsonNode counts = body.get("orderCounts");
        assertNotNull(counts, "detail must carry orderCounts");
        assertEquals(perCat.getOrDefault("lab", 0), counts.get("lab").asInt(),
                "orderCounts is the true per-category total");
    }

    @Test
    void caseDetailIncludesServerHistoryForApprovedCase() throws Exception {
        // an approved case's detail carries a populated `history` array (the
        // coder audit trail); each entry is {action, coder, at}. Same empty
        // start state as above, so approve first and always reopen after.
        approve(APPROVABLE_CASE_ID);
        try {
            JsonNode history = getJson("/api/cases/" + APPROVABLE_CASE_ID).get("history");
            assertTrue(history.isArray() && history.size() > 0,
                    "an approved case's detail should carry a non-empty history");
            JsonNode h0 = history.get(0);
            assertTrue(h0.has("action") && h0.has("coder") && h0.has("at"),
                    "each history entry has action, coder, at");
            assertTrue(List.of("approved_single", "approved_group", "approved_all", "reopened",
                            "code_assigned").contains(h0.get("action").asString()),
                    "history action should be a known coder action, got " + h0.get("action").asString());
        } finally {
            reopen(APPROVABLE_CASE_ID);
        }
    }

    @Test
    void approveThenReopenRoundTripsAndInvalidatesCache() throws Exception {
        // stats shape per docs/api-contract.md: one case, no saved edits ->
        // the imported principal is re-confirmed (1 code) + 1 status row.
        //
        // mcai_code_rows counts hospital DIFF writes (2026-07-24). TWO for this
        // fixture, and both are worth understanding:
        //   1. a PUT on the principal — our catalog describes L02.4 as
        //      "Abscess, hip" while the hospital's row reads "Abscess, Rt hip",
        //      and a description we hold is sent (blank ones never are);
        //   2. a CANCEL of the visit's ICD-9 — "no saved edits" re-confirms the
        //      imported PRINCIPAL only, so the procedure is not in the coder's
        //      final list and the diff removes it. The reopen below puts it back
        //      (with a fresh object_id, since iMed has no un-cancel), which is
        //      what keeps this number stable across runs.
        mvc.perform(post("/api/cases/approve").header("Authorization", auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + APPROVABLE_CASE_ID + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approved[0]").value(APPROVABLE_CASE_ID))
                .andExpect(jsonPath("$.notFound").isEmpty())
                .andExpect(jsonPath("$.stats.cases_finalized").value(1))
                .andExpect(jsonPath("$.stats.status_rows").value(1))
                .andExpect(jsonPath("$.stats.mcai_code_rows").value(2));

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

    // ---- shared case star (2026-08-25) ----
    // One star per case, set by any coder and seen by all of them — the value
    // of the feature IS that it crosses coders, so the assertions follow it
    // from the write endpoint into the dashboard payload every coder reads.

    @Test
    void starringACaseShowsUpOnTheCardForEveryCoder() throws Exception {
        // start clean: the star is persistent, so a previous run must not decide
        // this one's outcome
        mvc.perform(delete("/api/cases/{id}/star", KNOWN_CASE_ID).header("Authorization", auth()))
                .andExpect(status().isOk());

        String starredBy = mvc.perform(post("/api/cases/{id}/star", KNOWN_CASE_ID)
                        .header("Authorization", auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.starred").value(true))
                .andExpect(jsonPath("$.starredAt").isString())
                .andReturn().getResponse().getContentAsString();
        JsonNode set = json.readTree(starredBy);
        assertTrue(isRealAccount(set.get("starredBy").asString()),
                "starredBy must be a real account (the logged-in coder), not a synthesized name");
        assertTrue(set.get("starredAt").asString().matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}"),
                "starredAt is a backend-written datetime: YYYY-MM-DD HH:MM:SS");

        // the card another coder loads carries it — and the cases cache had to
        // invalidate for that to be true
        JsonNode card = findCase(getJson("/api/cases"), KNOWN_CASE_ID);
        assertNotNull(card, "the starred case should still be listed on the dashboard");
        assertTrue(card.get("starred").asBoolean(), "the star belongs to the case, not to a session");
        assertEquals(set.get("starredBy").asString(), card.get("starredBy").asString());
        assertEquals(set.get("starredAt").asString(), card.get("starredAt").asString());

        // the coder who left it may take it down again (another coder gets a
        // 403 — the pure rule is covered in CaseStarOwnershipTest)
        mvc.perform(delete("/api/cases/{id}/star", KNOWN_CASE_ID).header("Authorization", auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.starred").value(false))
                .andExpect(jsonPath("$.starredBy").isEmpty())
                .andExpect(jsonPath("$.starredByStamp").isEmpty())
                .andExpect(jsonPath("$.starredAt").isEmpty());

        JsonNode cleared = findCase(getJson("/api/cases"), KNOWN_CASE_ID);
        assertNotNull(cleared);
        assertFalse(cleared.get("starred").asBoolean());
        assertTrue(cleared.get("starredBy").isNull(), "starredBy is null once the star is gone");
    }

    @Test
    void everyCardCarriesTheStarKeysStarredOrNot() throws Exception {
        // "no key is ever absent" (docs/api-contract.md conventions) — the
        // frontend renders one star control per row and must not null-check the
        // shape of the row it got
        JsonNode sample = firstListedCase(getJson("/api/cases"));
        assertNotNull(sample, "expected at least one case in the dashboard payload");
        assertTrue(sample.has("starred") && sample.get("starred").isBoolean());
        assertTrue(sample.has("starredBy"));
        // the owning account, so the row can decide whether to offer "remove"
        assertTrue(sample.has("starredByStamp"));
        assertTrue(sample.has("starredAt"));
    }

    @Test
    void caseDetailCarriesTheStarSoTheCasePageCanShowIt() throws Exception {
        // a coder who deep-links or reloads straight into a case has no card to
        // read the star off — the detail payload has to carry the same value
        mvc.perform(delete("/api/cases/{id}/star", KNOWN_CASE_ID).header("Authorization", auth()))
                .andExpect(status().isOk());

        JsonNode unstarred = getJson("/api/cases/" + KNOWN_CASE_ID);
        assertTrue(unstarred.has("starred") && !unstarred.get("starred").asBoolean());
        assertTrue(unstarred.get("starredBy").isNull(), "starredBy is null while unstarred");
        assertTrue(unstarred.get("starredByStamp").isNull(), "starredByStamp is null while unstarred");
        assertTrue(unstarred.get("starredAt").isNull(), "starredAt is null while unstarred");

        String set = mvc.perform(post("/api/cases/{id}/star", KNOWN_CASE_ID)
                        .header("Authorization", auth()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode state = json.readTree(set);

        JsonNode starred = getJson("/api/cases/" + KNOWN_CASE_ID);
        assertTrue(starred.get("starred").asBoolean(), "the case page sees the star the card sees");
        assertEquals(state.get("starredBy").asString(), starred.get("starredBy").asString());
        assertEquals(state.get("starredByStamp").asString(), starred.get("starredByStamp").asString());
        assertEquals(state.get("starredAt").asString(), starred.get("starredAt").asString());

        mvc.perform(delete("/api/cases/{id}/star", KNOWN_CASE_ID).header("Authorization", auth()))
                .andExpect(status().isOk());
    }

    @Test
    void starringAnUnknownCaseReturns404() throws Exception {
        mvc.perform(post("/api/cases/{id}/star", "no-such-case").header("Authorization", auth()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not found"));
        mvc.perform(delete("/api/cases/{id}/star", "no-such-case").header("Authorization", auth()))
                .andExpect(status().isNotFound());
    }

    // ---- ICD-9 operation time window (2026-07-30) ----
    // An ICD-9 code is a procedure, and a procedure happens over a time window.
    // The hospital records it on both surfaces (extract startdatetime/enddatetime,
    // write API date_in/time_in/date_out/time_out); we carry it end-to-end.

    @Test
    void syncImportsTheHospitalOperationWindowOntoIcd9Codes() throws Exception {
        // this visit carries a seeded ICD-9 hemorrhoidectomy with a real
        // operation window; the per-case sync re-imports it with the times
        postJson("/api/cases/" + TIMED_PROCEDURE_CASE_ID + "/sync");

        JsonNode codes = getJson("/api/cases/" + TIMED_PROCEDURE_CASE_ID).get("codes");
        boolean sawTimedIcd9 = false;
        for (JsonNode c : codes) {
            assertTrue(c.has("operation_start") && c.has("operation_end") && c.has("operation_type"),
                    "every code row carries the operation window + type keys");
            if ("ICD-10".equals(c.get("code_system").asString())) {
                assertTrue(c.get("operation_start").isNull() && c.get("operation_end").isNull()
                                && c.get("operation_type").isNull(),
                        "a diagnosis has no operation window or type");
            }
            if ("49.46".equals(c.get("code").asString())) {
                // the procedure's window and type, verbatim from the hospital —
                // and proof the ISO 8601 the contract now sends is parsed
                // rather than silently truncated to midnight
                assertEquals("2026-07-22 11:05:00", c.get("operation_start").asString());
                assertEquals("2026-07-22 11:52:00", c.get("operation_end").asString());
                assertEquals("OR Procedure", c.get("operation_type").asString());
                sawTimedIcd9 = true;
            }
        }
        assertTrue(sawTimedIcd9, "expected the imported 49.46 procedure with its hospital times");
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
            // the second reading of this visit is the one with blank columns
            if (v.get("weight").isNull() && reading == null && !v.get("systolic").isNull()) {
                reading = v;
            }
        }
        // that reading, verbatim — and its blank columns served as null
        assertNotNull(reading, "expected a seeded reading with blank weight/height");
        assertEquals("138", reading.get("systolic").asString());
        assertEquals("82", reading.get("diastolic").asString());
        assertEquals("88", reading.get("heart_rate").asString());
        assertTrue(reading.get("temperature").isNull() && reading.get("oxygen_saturation").isNull()
                        && reading.get("weight").isNull() && reading.get("height").isNull(),
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

    @Test
    void unselectedCodeEditsAreKeptButNotApproved() throws Exception {
        // Selection-first coding (2026-08-07): the UI ticks the codes to approve
        // instead of deleting the rest, so `selected: false` rows must survive in
        // the working state (still visible and re-tickable) while staying out of
        // the materialized coder_assigned rows. Same mirror-the-imported-codes
        // shape as the operation-times test, so the hospital diff only creates
        // the one new procedure (reverted by reopen in the finally).
        JsonNode imported = getJson("/api/cases/" + APPROVABLE_CASE_ID).get("codes");
        List<String> entries = new ArrayList<>();
        for (JsonNode c : imported) {
            entries.add(json.writeValueAsString(java.util.Map.of(
                    "code", c.get("code").asString(),
                    "type", c.get("code_system").asString(),
                    "desc", c.get("description").isNull() ? "" : c.get("description").asString(),
                    "selected", true)));
        }
        entries.add("""
                {"code":"93.22","type":"ICD-9 Primary Diagnosis","desc":"Ambulation and gait training",
                 "selected":true}""");
        // the suggestion the coder left unticked
        entries.add("""
                {"code":"V89.2","type":"ICD-10 External Cause","selected":false,
                 "desc":"Person injured in unspecified motor-vehicle accident, traffic"}""");
        try {
            mvc.perform(put("/api/cases/{id}/codes", APPROVABLE_CASE_ID).header("Authorization", auth())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("[" + String.join(",", entries) + "]"))
                    .andExpect(status().isOk());
            mvc.perform(post("/api/cases/approve").header("Authorization", auth())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"ids\":[\"" + APPROVABLE_CASE_ID + "\"]}"))
                    .andExpect(status().isOk());

            JsonNode detail = getJson("/api/cases/" + APPROVABLE_CASE_ID);
            boolean tickedMaterialized = false;
            boolean untickedMaterialized = false;
            for (JsonNode c : detail.get("codes")) {
                if (!"coder_assigned".equals(c.get("source").asString())) {
                    continue;
                }
                tickedMaterialized |= "93.22".equals(c.get("code").asString());
                untickedMaterialized |= "V89.2".equals(c.get("code").asString());
            }
            assertTrue(tickedMaterialized, "a ticked edit becomes a coder_assigned row");
            assertFalse(untickedMaterialized, "an unticked edit is never written at approve");

            // the unticked row is still working state — the coder can tick it later
            boolean echoed = false;
            for (JsonNode e : detail.get("codeEdits")) {
                if ("V89.2".equals(e.get("code").asString())) {
                    echoed = true;
                    assertFalse(e.get("selected").asBoolean(), "its selected flag round-trips");
                }
            }
            assertTrue(echoed, "unticked codes stay in the saved codeEdits payload");
        } finally {
            mvc.perform(post("/api/cases/{id}/reopen", APPROVABLE_CASE_ID).header("Authorization", auth())
                            .contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isOk());
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
        // any open case will do; KNOWN_CASE_ID is open and no write test
        // touches it, unlike complete[0] which drains as cases are reopened
        String openId = KNOWN_CASE_ID;

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
        // empty start state: approve one here rather than expecting a finished
        // case in the seed, and reopen it however this ends
        approve(APPROVABLE_CASE_ID);
        try {
            JsonNode r = postJson("/api/cases/" + APPROVABLE_CASE_ID + "/sync");
            assertTrue(containsString(r.get("skippedApproved"), APPROVABLE_CASE_ID),
                    "an approved case must be protected from sync, not rebuilt");
            assertTrue(r.get("refreshed").isEmpty());
            assertTrue(r.get("imported").isEmpty());
        } finally {
            reopen(APPROVABLE_CASE_ID);
        }
    }

    @Test
    void syncUnknownCaseReturns404() throws Exception {
        mvc.perform(post("/api/cases/does-not-exist/sync").header("Authorization", auth()))
                .andExpect(status().isNotFound());
    }

    @Test
    void bulkSyncAcceptsAVisitDatetimeWindow() throws Exception {
        // A window over nothing is a valid, empty sync — and the response
        // echoes the window (the key is ABSENT on unwindowed syncs).
        JsonNode none = postSync("{\"from\":\"2030-01-01\",\"to\":\"2030-01-02\"}");
        assertTrue(none.get("ok").asBoolean());
        assertTrue(none.get("imported").isEmpty() && none.get("refreshed").isEmpty()
                && none.get("skippedApproved").isEmpty() && none.get("failed").isEmpty());
        assertEquals("2030-01-01", none.get("window").get("from").asString());
        assertEquals("2030-01-02", none.get("window").get("to").asString());

        // One-day window: the hospital filters on the VISIT datetime, which its
        // transaction numbers encode at positions 4-9 as YYMMDD — so every
        // touched case must be from that day, and no other day leaks in.
        JsonNode day = postSync("{\"from\":\"2026-07-24\",\"to\":\"2026-07-24\"}");
        int touched = 0;
        for (String bucket : List.of("imported", "refreshed", "skippedApproved")) {
            for (JsonNode id : day.get(bucket)) {
                assertEquals("260724", id.asString().substring(3, 9),
                        "case outside the window was synced: " + id.asString());
                touched++;
            }
        }
        assertTrue(touched > 0, "the seeded hospital has visits on 2026-07-24");
        assertTrue(day.get("failed").isEmpty());
        assertTrue(day.get("window").get("to").asString().equals("2026-07-24"));

        // malformed bound → 400 before any hospital call
        mvc.perform(post("/api/sync").header("Authorization", auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"from\":\"next-tuesday\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error")
                        .value("from must be YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS]"));
        // an open start would mean one hospital call per day back to forever
        mvc.perform(post("/api/sync").header("Authorization", auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"to\":\"2026-07-24\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("from is required when to is given"));
    }

    @Test
    void unwindowedSyncRefreshesKnownOpenCasesAndImportsNothing() throws Exception {
        // the hospital has no list-every-visit route, so "no window" means
        // re-read the open cases we already hold, by their saved visit ids
        List<String> open = jdbc.queryForList(
                "SELECT case_id FROM cases WHERE case_status::text = 'open'", String.class);
        assertFalse(open.isEmpty(), "the seeded dataset has open cases");

        JsonNode all = postSync("{}");
        assertTrue(all.get("ok").asBoolean());
        assertTrue(all.get("imported").isEmpty(), "nothing new can arrive without a window");
        assertTrue(all.get("skippedApproved").isEmpty(), "finalized cases are not even fetched");
        assertTrue(all.get("failed").isEmpty());
        assertEquals(open.size(), all.get("refreshed").size(), "every open case is re-read");
        assertTrue(all.get("window") == null, "no window key on an unwindowed sync");
        // the hospital's "F"/"M" are stored in our one vocabulary
        assertTrue(jdbc.queryForList("SELECT DISTINCT sex FROM cases WHERE sex IS NOT NULL",
                String.class).stream().allMatch(x -> x.equals("female") || x.equals("male")));
    }

    private JsonNode postSync(String body) throws Exception {
        String resp = mvc.perform(post("/api/sync").header("Authorization", auth())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(resp);
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

    @Test
    void analyticsServesTheV2CardsWithTheirInvariants() throws Exception {
        // The 2026-08-20 additions to GET /api/analytics. Assertions are the
        // contract's dataset-independent invariants, so this passes on any
        // seeded state — including a fresh empty-start-state demo baseline.
        JsonNode root = getJson("/api/analytics");
        for (String key : List.of("documentationGaps", "codingActivity", "turnaround",
                "codingDepth", "caseMix")) {
            assertTrue(root.has(key), "missing analytics key: " + key);
        }

        // codingActivity: same window/zero-fill contract as casesOverTime
        assertEquals(root.get("casesOverTime").size(), root.get("codingActivity").size(),
                "codingActivity must cover the same days window as casesOverTime");
        for (JsonNode p : root.get("codingActivity")) {
            assertTrue(p.get("iso").asString().endsWith("T00:00:00"));
            assertTrue(p.get("approved").asLong() >= 0);
            assertTrue(p.get("coded").asLong() >= 0);
            assertTrue(p.get("reopened").asLong() >= 0);
        }

        // turnaround: both percentiles null exactly while cases = 0
        JsonNode ta = root.get("turnaround");
        if (ta.get("cases").asLong() == 0) {
            assertTrue(ta.get("medianMinutes").isNull(), "median must be null with no approvals");
            assertTrue(ta.get("p90Minutes").isNull(), "p90 must be null with no approvals");
        } else {
            assertTrue(ta.get("medianMinutes").asLong() >= 0);
            assertTrue(ta.get("p90Minutes").asLong() >= ta.get("medianMinutes").asLong(),
                    "p90 can never sit below the median");
        }

        // codingDepth: always exactly the five buckets, in order; uncoded IS
        // the "0" bucket's count
        JsonNode depth = root.get("codingDepth");
        List<String> buckets = new ArrayList<>();
        for (JsonNode b : depth.get("distribution")) {
            buckets.add(b.get("bucket").asString());
        }
        assertEquals(List.of("0", "1", "2", "3-5", "6+"), buckets);
        assertEquals(depth.get("distribution").get(0).get("cases").asLong(),
                depth.get("uncoded").asLong(), "uncoded must equal the 0 bucket");

        // caseMix: every group row reconciles — low+medium+high+other = total
        for (JsonNode g : root.get("caseMix").get("groups")) {
            assertEquals(g.get("total").asLong(),
                    g.get("low").asLong() + g.get("medium").asLong()
                            + g.get("high").asLong() + g.get("other").asLong(),
                    "severity split must add up for group " + g.get("label").asString());
        }

        // documentationGaps: labeled items, each counting at least one case
        for (JsonNode item : root.get("documentationGaps").get("items")) {
            assertFalse(item.get("label").asString().isBlank());
            assertTrue(item.get("count").asLong() >= 1);
        }
        for (JsonNode grp : root.get("documentationGaps").get("byGroup")) {
            assertTrue(grp.get("incomplete").asLong() <= grp.get("total").asLong(),
                    "a group can never have more incomplete cases than cases");
        }
    }

    @Test
    void analyticsRequiresAToken() throws Exception {
        mvc.perform(get("/api/analytics"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void everyCaseCarriesAVisitDateAndAge() throws Exception {
        // 2026-08-25: created_at is null on every OPD row, so the list had no
        // date. visitDate falls back to the datetime encoded in the TN.
        JsonNode root = getJson("/api/cases");
        int checked = 0;
        for (JsonNode c : root.get("complete")) {
            assertTrue(c.has("visitDate"), "every case row must carry visitDate");
            assertTrue(c.has("age"), "every case row must carry age");

            // where created_at exists, visitDate must BE it — the fallback may
            // never override what the hospital actually sent
            if (!c.get("created_at").isNull()) {
                assertEquals(c.get("created_at").asString(), c.get("visitDate").asString(),
                        "visitDate must prefer the real admissiondatetime");
            } else if (!c.get("visitDate").isNull()) {
                // …otherwise it is the TN decode, which must agree with the
                // digits the id actually carries
                String id = c.get("id").asString();
                String vd = c.get("visitDate").asString();
                assertEquals("20" + id.substring(3, 5) + "-" + id.substring(5, 7)
                                + "-" + id.substring(7, 9),
                        vd.substring(0, 10),
                        "visitDate must decode positions 4-15 of the transaction number");
                assertEquals(19, vd.length(), "visitDate must be YYYY-MM-DD HH:MM:SS");
            }
            checked++;
        }
        assertTrue(checked > 0, "the seeded dataset must have at least one complete case");
    }

    @Test
    void caseFieldSettingsAreReadableByAnyoneAndWritableOnlyByAdmins() throws Exception {
        JsonNode before = getJson("/api/case-field-settings");
        for (String k : List.of("vn", "hn", "name")) {
            assertTrue(before.get(k).isBoolean(), k + " must be a boolean");
        }

        // a write flips exactly the key it names and leaves the others alone
        boolean hn = before.get("hn").asBoolean();
        JsonNode after = putJson("/api/admin/case-field-settings", "{\"hn\": " + !hn + "}");
        assertEquals(!hn, after.get("hn").asBoolean(), "the named key must change");
        assertEquals(before.get("vn").asBoolean(), after.get("vn").asBoolean(),
                "an omitted key must keep its value");
        assertEquals(before.get("name").asBoolean(), after.get("name").asBoolean(),
                "an omitted key must keep its value");
        // it persists, rather than only being echoed back
        assertEquals(!hn, getJson("/api/case-field-settings").get("hn").asBoolean());

        // a bad key and a non-boolean are both 400s that change nothing
        for (String bad : List.of("{\"age\": true}", "{\"hn\": \"yes\"}")) {
            mvc.perform(put("/api/admin/case-field-settings")
                            .header("Authorization", auth())
                            .contentType(MediaType.APPLICATION_JSON).content(bad))
                    .andExpect(status().isBadRequest());
        }
        assertEquals(!hn, getJson("/api/case-field-settings").get("hn").asBoolean(),
                "a rejected write must not have changed anything");

        // put it back, so the suite leaves the database as it found it
        putJson("/api/admin/case-field-settings", "{\"hn\": " + hn + "}");
        assertEquals(hn, getJson("/api/case-field-settings").get("hn").asBoolean());
    }

    @Test
    void caseFieldSettingsRequireAToken() throws Exception {
        mvc.perform(get("/api/case-field-settings"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
        mvc.perform(put("/api/admin/case-field-settings")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hn\": true}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void analyticsServesTheHospitalDashboardCards() throws Exception {
        // The 2026-08-25 additions: the coder's own dashboard widgets. Again
        // dataset-independent invariants, so this holds on any seeded state.
        JsonNode root = getJson("/api/analytics");
        for (String key : List.of("range", "topPrincipalDiagnosis", "coderKpi")) {
            assertTrue(root.has(key), "missing analytics key: " + key);
        }

        // summary: notFinished reconciles against the three unfinished queues,
        // and finishedPct is null exactly while there is nothing to divide by
        JsonNode sum = root.get("summary");
        long total = sum.get("total").asLong();
        long finished = sum.get("finished").asLong();
        assertEquals(total - finished, sum.get("notFinished").asLong(),
                "notFinished must be total - finished");
        assertEquals(sum.get("complete").asLong() + sum.get("incomplete").asLong()
                        + sum.get("reopened").asLong(),
                sum.get("notFinished").asLong(),
                "notFinished must also equal complete + incomplete + reopened");
        if (total == 0) {
            assertTrue(sum.get("finishedPct").isNull(), "no cases must read as null, not 0%");
        } else {
            double pct = sum.get("finishedPct").asDouble();
            assertTrue(pct >= 0 && pct <= 100, "finishedPct out of range: " + pct);
        }

        // unfiltered: range echoes filtered=false, and summary still matches
        // the dashboard's own stats exactly (the no-drift guarantee)
        assertFalse(root.get("range").get("filtered").asBoolean(),
                "a request with no from/to must report filtered=false");
        JsonNode stats = getJson("/api/cases").get("stats");
        for (String k : List.of("total", "complete", "incomplete", "reopened", "finished")) {
            assertEquals(stats.get(k).asLong(), sum.get(k).asLong(),
                    "unfiltered analytics." + k + " must match the dashboard's");
        }

        // topPrincipalDiagnosis: ICD-10 only, by construction
        for (JsonNode c : root.get("topPrincipalDiagnosis")) {
            assertEquals("ICD-10", c.get("system").asString(),
                    "a principal diagnosis is never an ICD-9 row");
            assertTrue(c.get("count").asLong() >= 1);
            assertFalse(c.get("code").asString().isBlank());
        }

        // coderKpi: percentages are null exactly when their denominator is 0,
        // and no numerator can exceed the denominator it is measured against
        for (JsonNode r : root.get("coderKpi")) {
            long touched = r.get("touched").asLong();
            long fin = r.get("finished").asLong();
            long measured = r.get("measured").asLong();
            long within7 = r.get("within7Days").asLong();
            assertTrue(fin <= touched, "a coder cannot finish more cases than they touched");
            assertTrue(measured <= fin, "only finished cases can be measured");
            assertTrue(within7 <= measured, "within7Days cannot exceed measured");
            assertEquals(touched == 0, r.get("finishedPct").isNull(),
                    "finishedPct is null exactly when touched is 0");
            assertEquals(measured == 0, r.get("within7DaysPct").isNull(),
                    "within7DaysPct is null exactly when measured is 0");
        }
    }

    @Test
    void analyticsDateFilterScopesThePageAndRejectsHalfRanges() throws Exception {
        // A window in the future can match nothing, whatever the dataset —
        // the strongest dataset-independent proof that the filter is applied.
        String far = java.time.LocalDate.now().plusYears(5).toString();
        JsonNode empty = getJson("/api/analytics?from=" + far + "&to=" + far);
        assertTrue(empty.get("range").get("filtered").asBoolean());
        assertEquals(far, empty.get("range").get("from").asString());
        assertEquals(0, empty.get("summary").get("total").asLong(),
                "no visit can fall in a window five years out");
        assertTrue(empty.get("summary").get("finishedPct").isNull(),
                "an empty window has nothing to take a percentage of");
        assertEquals(0, empty.get("topPrincipalDiagnosis").size());
        assertEquals(1, empty.get("casesOverTime").size(),
                "a one-day range must produce exactly one point");

        // …and the widest window the guard rail allows (a year ending today)
        // cannot report fewer cases than that empty one
        java.time.LocalDate today = java.time.LocalDate.now();
        JsonNode wide = getJson("/api/analytics?from=" + today.minusDays(364) + "&to=" + today);
        assertTrue(wide.get("summary").get("total").asLong()
                        >= empty.get("summary").get("total").asLong());
        assertEquals(365, wide.get("casesOverTime").size(),
                "the series must carry one point per day of the range");

        // half a range, a backwards range and an over-long span are all 400s
        for (String q : List.of("?from=2026-01-01", "?to=2026-01-01",
                "?from=2026-02-01&to=2026-01-01", "?from=1900-01-01&to=2026-01-01")) {
            mvc.perform(get("/api/analytics" + q).header("Authorization", auth()))
                    .andExpect(status().isBadRequest());
        }
    }

    private JsonNode putJson(String url, String body) throws Exception {
        String out = mvc.perform(put(url).header("Authorization", auth())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(out);
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

    /** Does any account actually go by this display name or email? */
    private boolean isRealAccount(String name) throws Exception {
        for (JsonNode a : getJson("/api/admin/accounts")) {   // a bare array
            if (name.equals(a.path("fullName").asString(null))
                    || name.equals(a.path("email").asString(null))) {
                return true;
            }
        }
        return false;
    }

    /** Approve one case through the real endpoint (hospital write-back included). */
    private void approve(String caseId) throws Exception {
        mvc.perform(post("/api/cases/approve").header("Authorization", auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + caseId + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approved[0]").value(caseId));
    }

    /** Undo it, so the suite leaves the demo dataset as it found it. */
    private void reopen(String caseId) throws Exception {
        mvc.perform(post("/api/cases/{id}/reopen", caseId).header("Authorization", auth()))
                .andExpect(status().isOk());
    }

    private JsonNode getJson(String url) throws Exception {
        String body = mvc.perform(get(url).header("Authorization", auth()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private JsonNode firstListedCase(JsonNode root) {
        for (String bucket : List.of("complete", "reopened", "finished")) {
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

    /** The card for one case wherever it currently lives in the payload. */
    private JsonNode findCase(JsonNode root, String caseId) {
        for (String bucket : List.of("complete", "reopened", "finished")) {
            for (JsonNode n : root.get(bucket)) {
                if (caseId.equals(n.get("id").asString())) {
                    return n;
                }
            }
        }
        for (JsonNode group : root.get("incompleteGroups")) {
            for (JsonNode n : group.get("cases")) {
                if (caseId.equals(n.get("id").asString())) {
                    return n;
                }
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
