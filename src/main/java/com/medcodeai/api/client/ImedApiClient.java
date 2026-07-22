package com.medcodeai.api.client;

import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

/**
 * Outbound HTTP to the hospital's iMed API (imed-mock-api today, the real
 * hospital API in production — same contract, base-URL swap only). Two calls,
 * both idempotent on the hospital side:
 *
 *   PUT    /api/cases/{tn}/coding-result   — submit approval results
 *   DELETE /api/cases/{tn}/coding-result   — clear them (reopen)
 *
 * Failures surface as exceptions → 500 to our caller. Our own DB transaction
 * has already committed by then (see ApprovalService); re-approving or
 * re-reopening heals, so no retry logic here.
 */
@Component
public class ImedApiClient {

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

    private IllegalStateException unreachable(Exception e) {
        return new IllegalStateException("iMed API not reachable at " + base
                + " — is imed-mock-api running? (cd ../imed-mock-api && ./mvnw spring-boot:run)", e);
    }
}
