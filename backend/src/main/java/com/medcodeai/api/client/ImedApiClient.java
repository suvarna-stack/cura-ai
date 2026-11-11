package com.medcodeai.api.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;

/**
 * HTTP to the hospital's API (imed-mock-api locally, the hospital's Medihack
 * API in production). Since 2026-11-09 this follows the hospital's own guide
 * for MedCode ("คู่มือเชื่อมต่อ MedCode กับ Medihack API", 4 Nov 2026), which
 * replaces the contract we first proposed wherever the two differ.
 *
 * AUTH — client credentials, not a fixed token:
 *   POST {IMED_API_BASE}/auth/token   Basic IMED_CLIENT_ID:IMED_CLIENT_SECRET,
 *        grant_type=client_credentials → {access_token, token_type, expires_in}
 * The token is cached and renewed shortly before it expires
 * ({@link ImedTokenProvider}); a 401 on any call drops it and the call is
 * retried once with a fresh one (safe: a 401 means nothing was processed).
 * IMED_API_BASE is the HOST — no /api/v1, no trailing slash — because the
 * token route sits at the root and everything else under /api/v1.
 *
 * READ (sync) — five routes:
 *   POST /api/v1/cases/sync           — full case data for ≤ 20 visit ids
 *   POST /api/v1/cases/sync-by-period — the same, for a ≤ 31-day window
 *   GET  /api/v1/catalog/icd10|icd9   — the hospital's code masters
 *   POST /api/v1/contract/check       — schema gate run before every sync
 * The R1 update check we proposed (POST /cases/check) was NOT built — the
 * hospital parked it; callers re-read the visit ids they already hold.
 *
 * WRITE (approve/reopen):
 *   POST   /api/v1/diagnosis                            — create dx OR px rows
 *   PUT    /api/v1/diagnosis/{visit_id}                 — edit rows / coding status
 *   DELETE /api/v1/diagnosis/{visit_id}/icd10|icd9/{id} — cancel one row
 * While the hospital's write side is a mock it answers {@code mock: true} and
 * saves nothing in HIS; that is logged (once) as a warning, not an error.
 *
 * Every failure surfaces as a {@link HospitalApiException} whose message
 * names the cause and the route — our API answers it as a 502 and the
 * coder's screen shows it. For writes our own DB
 * transaction has already committed by then (see ApprovalService); the
 * write-back diff recomputes against live hospital state, so re-approving or
 * re-reopening heals — no retry logic here beyond the single 401 retry.
 */
@Component
public class ImedApiClient {

    private static final Logger log = LoggerFactory.getLogger(ImedApiClient.class);

    /** Row-list body type shared by the catalogue endpoints. */
    private static final ParameterizedTypeReference<List<Map<String, Object>>> ROWS =
            new ParameterizedTypeReference<>() {
            };

    private static final ParameterizedTypeReference<Map<String, Object>> ENVELOPE =
            new ParameterizedTypeReference<>() {
            };

    private final String base;
    private final String clientId;
    private final String clientSecret;
    private final RestClient http;
    private final ImedTokenProvider tokens;
    /** Log the hospital's mock mode once per process, not on every write. */
    private final AtomicBoolean mockModeLogged = new AtomicBoolean();

    public ImedApiClient() {
        // the mock's default credentials; the real pair comes from the hospital's admin
        // a day of full case objects from a real hospital is far bigger than the
        // mock's — 10s was only ever tuned against localhost
        this(envOr("IMED_API_BASE", "http://localhost:8003"),
                envOr("IMED_CLIENT_ID", "medcode-mock-client"),
                envOr("IMED_CLIENT_SECRET", "medcode-mock-secret"),
                Duration.ofSeconds(Long.parseLong(envOr("IMED_READ_TIMEOUT_SECONDS", "60"))));
    }

    /** What the environment would set, passed in — tests point this at a local server. */
    ImedApiClient(String base, String clientId, String clientSecret, Duration readTimeout) {
        this.base = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(readTimeout);
        this.http = RestClient.builder().baseUrl(this.base).requestFactory(factory).build();
        this.tokens = new ImedTokenProvider(this::fetchToken, Clock.systemUTC());
    }

    private static String envOr(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }

    // ---- auth ---------------------------------------------------------------

    /** POST /auth/token — Basic client credentials, form body, as the guide shows. */
    private ImedTokenProvider.Token fetchToken() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        Map<String, Object> body;
        try {
            body = http.post().uri("/auth/token")
                    .headers(h -> h.setBasicAuth(clientId, clientSecret))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(form)
                    .retrieve().body(ENVELOPE);
        } catch (HttpClientErrorException.Unauthorized e) {
            throw new HospitalApiException("the hospital API refused our client credentials at "
                    + base + "/auth/token — check IMED_CLIENT_ID / IMED_CLIENT_SECRET", e);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        } catch (RestClientResponseException e) {
            throw answered("POST /auth/token", e);
        }
        Object value = body == null ? null : body.get("access_token");
        if (value == null || value.toString().isBlank()) {
            throw new HospitalApiException("the hospital API's /auth/token answer had no access_token");
        }
        long expiresIn = body.get("expires_in") instanceof Number n ? n.longValue() : 0;
        return new ImedTokenProvider.Token(value.toString(), expiresIn);
    }

    /**
     * Runs one call with the current token. A 401 means the token died early
     * (revoked, or the server restarted and forgot it): drop it and retry ONCE
     * with a fresh one. A second 401 is a real refusal and propagates.
     * {@code route} ("POST /api/v1/…") only labels a failure for the coder.
     */
    private <T> T authed(String route, Function<String, T> call) {
        try {
            String token = tokens.current();
            try {
                return call.apply(token);
            } catch (HttpClientErrorException.Unauthorized e) {
                tokens.invalidate(token);
                return call.apply(tokens.current());
            }
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        } catch (RestClientResponseException e) {
            throw answered(route, e);
        }
    }

    // ---- write direction ----------------------------------------------------

    /** POST /api/v1/diagnosis — returns the envelope with generated object_ids. */
    public Map<String, Object> postDiagnosis(Map<String, Object> body) {
        return noteMockMode(authed("POST /api/v1/diagnosis", t -> http.post().uri("/api/v1/diagnosis")
                .headers(h -> h.setBearerAuth(t))
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(ENVELOPE)));
    }

    public void putDiagnosis(String visitId, Map<String, Object> body) {
        noteMockMode(authed("PUT /api/v1/diagnosis/" + visitId,
                t -> http.put().uri("/api/v1/diagnosis/{v}", visitId)
                .headers(h -> h.setBearerAuth(t))
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(ENVELOPE)));
    }

    /** DELETE …/icd10|icd9/{objectId} — the cancel flow; no body, idempotent. */
    public void cancelDiagnosis(String visitId, String kind, String objectId) {
        noteMockMode(authed("DELETE /api/v1/diagnosis/" + visitId + "/" + kind + "/" + objectId,
                t -> http.delete()
                .uri("/api/v1/diagnosis/{v}/{kind}/{id}", visitId, kind, objectId)
                .headers(h -> h.setBearerAuth(t))
                .retrieve().body(ENVELOPE)));
    }

    /**
     * The guide's write routes are mocks for now: every success carries
     * {@code mock: true} and nothing reaches HIS. Our side has already
     * committed by the time this answers, which is right — the approve is
     * real for us — but the hospital record is not, and that must be visible
     * somewhere. Once per process, so a busy day doesn't bury the log.
     */
    private Map<String, Object> noteMockMode(Map<String, Object> envelope) {
        if (envelope != null && Boolean.TRUE.equals(envelope.get("mock"))
                && mockModeLogged.compareAndSet(false, true)) {
            log.warn("the hospital API answered mock: true — write-back is simulated there, "
                    + "nothing is saved in HIS yet (logged once)");
        }
        return envelope == null ? Map.of() : envelope;
    }

    // ---- read direction -----------------------------------------------------

    /**
     * Full case objects for these visit ids. The hospital caps a call at
     * {@link #MAX_SYNC_BATCH} ids and refuses an empty list; callers batch.
     * Answers {cases, not_found} — unknown ids are reported, not an error.
     */
    public Map<String, Object> syncCases(List<String> visitIds) {
        return postEnvelope("/api/v1/cases/sync", Map.of("visit_ids", visitIds));
    }

    /**
     * The same case objects for a visit-date window, both ends included. The
     * hospital refuses a window longer than {@link #MAX_PERIOD_DAYS} days and
     * recommends one day per call, so callers chunk. Returns the cases directly
     * (this route has no not_found).
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> syncByPeriod(String from, String to) {
        Object cases = postEnvelope("/api/v1/cases/sync-by-period",
                Map.of("from", from, "to", to)).get("cases");
        return cases instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    /**
     * The schema gate. Sends the block.field names we read and answers
     * {valid, missing}. Run before every sync so a hospital-side field change
     * stops the run cleanly instead of half-importing cases.
     */
    public Map<String, Object> contractCheck(List<String> requiredFields) {
        return postEnvelope("/api/v1/contract/check", Map.of("required_fields", requiredFields));
    }

    // ---- reference catalogs — the hospital's ICD code master tables ---------

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
        } catch (RestClientResponseException e) {
            throw answered("POST /api/demo/snapshot", e);
        }
    }

    /** POST /api/demo/reset — restore the hospital DB to the demo baseline. */
    public Map<String, Object> demoReset() {
        try {
            return http.post().uri("/api/demo/reset").retrieve().body(ENVELOPE);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        } catch (RestClientResponseException e) {
            throw answered("POST /api/demo/reset", e);
        }
    }

    /** The sync-by-ids batch cap and the period window cap — the hospital enforces both. */
    public static final int MAX_SYNC_BATCH = 20;
    public static final int MAX_PERIOD_DAYS = 31;

    /** POST a JSON body to a read endpoint; a null body degrades to {}. */
    private Map<String, Object> postEnvelope(String uri, Map<String, Object> body) {
        Map<String, Object> out = authed("POST " + uri, t -> http.post().uri(uri)
                .headers(h -> h.setBearerAuth(t))
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(ENVELOPE));
        return out == null ? Map.of() : out;
    }

    /** GET a row-list endpoint; a null body degrades to an empty list. */
    private List<Map<String, Object>> getRows(String uri) {
        List<Map<String, Object>> body = authed("GET " + uri, t -> http.get().uri(uri)
                .headers(h -> h.setBearerAuth(t))
                .retrieve().body(ROWS));
        return body == null ? List.of() : body;
    }

    private HospitalApiException unreachable(Exception e) {
        return new HospitalApiException("iMed API not reachable at " + base
                + " — is the hospital's API running, and is IMED_API_BASE set to it?", e);
    }

    /** The hospital answered, with an error status. Its body stays in the log (via the cause). */
    private static HospitalApiException answered(String route, RestClientResponseException e) {
        return new HospitalApiException("the hospital API answered "
                + e.getStatusCode().value() + " on " + route, e);
    }
}
