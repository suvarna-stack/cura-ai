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
 * in production — same contract, base-URL swap only). Two directions:
 *
 * WRITE-BACK (approve/reopen) — idempotent on the hospital side:
 *   PUT    /api/cases/{tn}/coding-result   — submit approval results
 *   DELETE /api/cases/{tn}/coding-result   — clear them (reopen)
 *
 * READ / sync (inbound) — pull the hospital's case data for SyncService, one
 * method per read endpoint of imed-mock-api's ImedCasesReadController. Rows
 * arrive verbatim (exact extract column names, values as stored — datetime
 * parsing is the caller's job, per Data Mapping Q5).
 *
 * Failures surface as exceptions → 500 to our caller. For write-back our own DB
 * transaction has already committed by then (see ApprovalService); re-approving
 * or re-reopening heals, so no retry logic here.
 */
@Component
public class ImedApiClient {

    /** Row-list body type shared by every read endpoint. */
    private static final ParameterizedTypeReference<List<Map<String, Object>>> ROWS =
            new ParameterizedTypeReference<>() {
            };

    private final String base;
    private final RestClient http;

    public ImedApiClient() {
        String env = System.getenv("IMED_API_BASE");
        this.base = (env == null || env.isEmpty()) ? "http://localhost:8003" : env;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.http = RestClient.builder().baseUrl(base).requestFactory(factory).build();
    }

    public void putCodingResult(String tn, Map<String, Object> body) {
        try {
            http.put().uri("/api/cases/{tn}/coding-result", tn)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    public void deleteCodingResult(String tn) {
        try {
            http.delete().uri("/api/cases/{tn}/coding-result", tn)
                    .retrieve()
                    .toBodilessEntity();
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

    public List<Map<String, Object>> billingItems(String tn) {
        return getRows("/api/cases/{tn}/billing-items", tn);
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
