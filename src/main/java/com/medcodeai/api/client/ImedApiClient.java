package com.medcodeai.api.client;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * HTTP to the hospital's iMed API (imed-mock-api today, the real hospital API
 * in production — same contract, base-URL + token swap only). Two directions:
 *
 * WRITE (approve/reopen) — the hospital's REAL contract ("iMed Diagnosis and
 * Medical Discharge API"), Bearer-authenticated (IMED_API_TOKEN),
 * request_id-deduped on their side (the invented coding-status extension was
 * withdrawn 2026-08-02):
 *   POST   /api/v1/diagnosis                          — create dx/px + discharge
 *   PUT    /api/v1/diagnosis/{visit_id}               — edit rows by object_id
 *   DELETE /api/v1/diagnosis/{visit_id}/icd10|icd9/{id} — cancel one row
 *
 * READ / sync (inbound) — the "MedCode AI Case Data API" contract (R1-R6,
 * docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf), the read surface we
 * specified and the hospital is building; imed-mock-api serves it today:
 *   POST /api/v1/cases/check          — R1 cheap poll: what changed since T?
 *   POST /api/v1/cases/sync           — R2 full case data for <= 20 visit ids
 *   POST /api/v1/cases/sync-by-period — R3 same, for a visit-date window
 *   GET  /api/v1/catalog/icd10|icd9   — R4/R5 the hospital's code masters
 *   POST /api/v1/contract/check       — R6 schema gate run before every sync
 *
 * R2/R3 answer with the contract's nested CASE OBJECT (a visit block plus nine
 * data blocks), already ISO 8601, already blank-collapsed to null, cancelled
 * code rows already excluded — so this client does no reshaping. This replaced
 * the 12 per-table GETs on 2026-08-19: one call per 20 cases, not 12 per case.
 *
 * Failures surface as exceptions → 500 to our caller. For writes our own DB
 * transaction has already committed by then (see ApprovalService); the
 * write-back diff recomputes against live hospital state, so re-approving or
 * re-reopening heals — no retry logic here.
 */
@Component
public class ImedApiClient {

    /** Row-list body type shared by every read endpoint. */
    private static final ParameterizedTypeReference<List<Map<String, Object>>> ROWS =
            new ParameterizedTypeReference<>() {
            };

    private static final ParameterizedTypeReference<Map<String, Object>> ENVELOPE =
            new ParameterizedTypeReference<>() {
            };

    private final String base;
    private final RestClient http;

    public ImedApiClient() {
        String env = System.getenv("IMED_API_BASE");
        this.base = (env == null || env.isEmpty()) ? "http://localhost:8003" : env;
        String token = System.getenv("IMED_API_TOKEN");
        if (token == null || token.isEmpty()) {
            token = "imed-mock-token"; // imed-mock-api's default; real token comes from the hospital
        }
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.http = RestClient.builder().baseUrl(base).requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + token).build();
    }

    // ---- write direction: the real /api/v1 contract -------------------------

    /** POST /api/v1/diagnosis — returns the envelope with generated object_ids. */
    public Map<String, Object> postDiagnosis(Map<String, Object> body) {
        try {
            return http.post().uri("/api/v1/diagnosis")
                    .contentType(MediaType.APPLICATION_JSON).body(body)
                    .retrieve().body(ENVELOPE);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    public void putDiagnosis(String visitId, Map<String, Object> body) {
        try {
            http.put().uri("/api/v1/diagnosis/{v}", visitId)
                    .contentType(MediaType.APPLICATION_JSON).body(body)
                    .retrieve().toBodilessEntity();
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** DELETE …/icd10|icd9/{objectId} — iMed's cancel flow, idempotent. */
    public void cancelDiagnosis(String visitId, String kind, String objectId) {
        try {
            http.delete().uri("/api/v1/diagnosis/{v}/{kind}/{id}", visitId, kind, objectId)
                    .retrieve().toBodilessEntity();
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    // ---- read direction: the contract's R1-R6 --------------------------------

    /**
     * R1 — which visits changed at or after {@code changedSince} (ISO 8601).
     * New visits count as changed. Answers {has_changes, visit_ids}; no
     * clinical data, so this is cheap enough to poll.
     */
    public Map<String, Object> checkChanges(String changedSince) {
        return postEnvelope("/api/v1/cases/check", Map.of("changed_since", changedSince));
    }

    /**
     * R2 — full case objects for these visit ids. The hospital caps a call at
     * {@link #MAX_SYNC_BATCH} ids; callers must batch. Answers {cases,
     * not_found} — unknown ids are reported, not an error for the request.
     */
    public Map<String, Object> syncCases(List<String> visitIds) {
        return postEnvelope("/api/v1/cases/sync", Map.of("visit_ids", visitIds));
    }

    /**
     * R3 — the same case objects for a visit-date window, both ends included.
     * The hospital rejects a window longer than {@link #MAX_PERIOD_DAYS} days,
     * so callers must chunk. Returns the cases directly (R3 has no not_found).
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> syncByPeriod(String from, String to) {
        Object cases = postEnvelope("/api/v1/cases/sync-by-period",
                Map.of("from", from, "to", to)).get("cases");
        return cases instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    /**
     * R6 — the schema gate. Sends the block.field names we read and answers
     * {valid, missing}. Run before every sync so a hospital-side field change
     * stops the run cleanly instead of half-importing cases.
     */
    public Map<String, Object> contractCheck(List<String> requiredFields) {
        return postEnvelope("/api/v1/contract/check", Map.of("required_fields", requiredFields));
    }

    // ---- reference catalogs — the hospital's ICD code master tables (R4/R5) --

    public List<Map<String, Object>> icd10Codes() {
        return getRows("/api/v1/catalog/icd10");
    }

    public List<Map<String, Object>> icd9Codes() {
        return getRows("/api/v1/catalog/icd9");
    }

    // ---- demo tooling (mock-only endpoints, not the hospital contract) ----

    /** POST /api/demo/snapshot — freeze the hospital DB as the demo baseline. */
    public Map<String, Object> demoSnapshot() {
        try {
            return http.post().uri("/api/demo/snapshot").retrieve().body(ENVELOPE);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** POST /api/demo/reset — restore the hospital DB to the demo baseline. */
    public Map<String, Object> demoReset() {
        try {
            return http.post().uri("/api/demo/reset").retrieve().body(ENVELOPE);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** R2's batch cap and R3's window cap — the hospital enforces both. */
    public static final int MAX_SYNC_BATCH = 20;
    public static final int MAX_PERIOD_DAYS = 31;

    /** POST a JSON body to a contract read endpoint; a null body degrades to {}. */
    private Map<String, Object> postEnvelope(String uri, Map<String, Object> body) {
        try {
            Map<String, Object> out = http.post().uri(uri)
                    .contentType(MediaType.APPLICATION_JSON).body(body)
                    .retrieve().body(ENVELOPE);
            return out == null ? Map.of() : out;
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** GET a row-list endpoint; a null body degrades to an empty list. */
    private List<Map<String, Object>> getRows(String uri, Object... uriVars) {
        try {
            List<Map<String, Object>> body = http.get().uri(uri, uriVars).retrieve().body(ROWS);
            return body == null ? List.of() : body;
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    private IllegalStateException unreachable(Exception e) {
        return new IllegalStateException("iMed API not reachable at " + base
                + " — is imed-mock-api running? (cd ../imed-mock-api && ./mvnw spring-boot:run)", e);
    }
}
