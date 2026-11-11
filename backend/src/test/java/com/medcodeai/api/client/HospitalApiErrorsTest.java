package com.medcodeai.api.client;

import com.medcodeai.api.web.ApiExceptionHandler;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Every way a hospital call can fail ends as a HospitalApiException whose
 * message says what went wrong and where — and the API answers it as a 502
 * carrying that message, so the coder's screen can show it. Before this, all
 * of them were a bare 500 and the reason lived only in the backend log.
 * Runs against a throwaway local HTTP server: no database, no hospital.
 */
class HospitalApiErrorsTest {

    private HttpServer server;
    private String base;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private ImedApiClient client(String at) {
        return new ImedApiClient(at, "client", "secret", Duration.ofSeconds(5));
    }

    private void answer(String path, int status, String json) {
        server.createContext(path, ex -> {
            ex.getRequestBody().readAllBytes();
            byte[] b = json.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, b.length);
            ex.getResponseBody().write(b);
            ex.close();
        });
    }

    private void tokenOk() {
        answer("/auth/token", 200,
                "{\"access_token\":\"t\",\"token_type\":\"Bearer\",\"expires_in\":3600}");
    }

    @Test
    void anUnreachableHospitalSaysWhereWeLooked() throws IOException {
        int closed;
        try (ServerSocket s = new ServerSocket(0)) {
            closed = s.getLocalPort();
        }
        String nowhere = "http://127.0.0.1:" + closed;
        HospitalApiException e = assertThrows(HospitalApiException.class,
                () -> client(nowhere).contractCheck(List.of("visit.visit_id")));
        assertTrue(e.getMessage().contains("not reachable at " + nowhere), e.getMessage());
    }

    @Test
    void refusedClientCredentialsAreNamed() {
        answer("/auth/token", 401, "{\"error\":\"invalid_client\"}");
        HospitalApiException e = assertThrows(HospitalApiException.class,
                () -> client(base).contractCheck(List.of("visit.visit_id")));
        assertTrue(e.getMessage().contains("refused our client credentials"), e.getMessage());
    }

    @Test
    void anErrorOnTheTokenRouteNamesStatusAndRoute() {
        answer("/auth/token", 404, "{}");
        HospitalApiException e = assertThrows(HospitalApiException.class,
                () -> client(base).contractCheck(List.of("visit.visit_id")));
        assertTrue(e.getMessage().contains("404 on POST /auth/token"), e.getMessage());
    }

    @Test
    void anErrorOnAReadNamesStatusAndRoute() {
        tokenOk();
        answer("/api/v1/cases/sync", 500, "{\"error\":\"boom\"}");
        HospitalApiException e = assertThrows(HospitalApiException.class,
                () -> client(base).syncCases(List.of("V1")));
        assertTrue(e.getMessage().contains("500 on POST /api/v1/cases/sync"), e.getMessage());
    }

    @Test
    void anErrorOnAWriteNamesStatusAndRoute() {
        tokenOk();
        answer("/api/v1/diagnosis", 409, "{\"error\":\"duplicate\"}");
        HospitalApiException e = assertThrows(HospitalApiException.class,
                () -> client(base).cancelDiagnosis("V1", "icd10", "77"));
        assertTrue(e.getMessage().contains("409 on DELETE /api/v1/diagnosis/V1/icd10/77"),
                e.getMessage());
        // the hospital's own error body rides along in the cause → the backend log
        assertTrue(e.getCause().getMessage().contains("duplicate"), e.getCause().getMessage());
    }

    @Test
    void theApiAnswersAHospitalFailureAs502WithTheReason() {
        ResponseEntity<Map<String, Object>> r = new ApiExceptionHandler()
                .hospital(new HospitalApiException("iMed API not reachable at x"));
        assertEquals(502, r.getStatusCode().value());
        assertEquals("iMed API not reachable at x", r.getBody().get("error"));
    }
}
