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
 * READ / sync (inbound) — pull the hospital's case data for SyncService, one
 * method per read endpoint of imed-mock-api's ImedCasesReadController. Rows
 * arrive verbatim (exact extract column names, values as stored — datetime
 * parsing is the caller's job, per Data Mapping Q5). Cancelled rows are
 * already excluded by the hospital side.
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

    // ---- read direction (sync) — GET /api/cases and the per-visit tables ----

    /** GET /api/cases — all hospital visits (medhack_patient). */
    public List<Map<String, Object>> cases() {
        return getRows("/api/cases");
    }

    public List<Map<String, Object>> medicalRecords(String tn) {
        return getRows("/api/cases/{tn}/medical-records", tn);
    }

    public List<Map<String, Object>> medicalRecordResults(String tn) {
        return getRows("/api/cases/{tn}/medical-record-results", tn);
    }

    public List<Map<String, Object>> diagnoses(String tn) {
        return getRows("/api/cases/{tn}/diagnoses", tn);
    }

    public List<Map<String, Object>> procedures(String tn) {
        return getRows("/api/cases/{tn}/procedures", tn);
    }

    public List<Map<String, Object>> orderDrugs(String tn) {
        return getRows("/api/cases/{tn}/orders/drugs", tn);
    }

    public List<Map<String, Object>> orderLabs(String tn) {
        return getRows("/api/cases/{tn}/orders/labs", tn);
    }

    public List<Map<String, Object>> bedManagement(String tn) {
        return getRows("/api/cases/{tn}/bed-management", tn);
    }

    public List<Map<String, Object>> vitalSigns(String tn) {
        return getRows("/api/cases/{tn}/vital-signs", tn);
    }

    public List<Map<String, Object>> billingItems(String tn) {
        return getRows("/api/cases/{tn}/billing-items", tn);
    }

    // ---- reference catalogs — the hospital's ICD code master tables ----

    public List<Map<String, Object>> icd10Codes() {
        return getRows("/api/icd10-codes");
    }

    public List<Map<String, Object>> icd9Codes() {
        return getRows("/api/icd9-codes");
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
