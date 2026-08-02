package com.medcodeai.api.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Guards the Swagger UI, which is a hands-on dev tool rather than a contract:
 * this checks only that springdoc still generates a spec (it breaks quietly on
 * a Spring Boot / Jackson upgrade) and that the route list below and the spec
 * agree EXACTLY. Response SHAPE is CasesApiIntegrationTest's job — the examples
 * in the annotations are illustrative, not asserted.
 *
 * The match is deliberately two-way (2026-07-29). It used to check only that
 * every expected path was present, which let a new endpoint ship with no entry
 * here and — because nothing else forces the issue — no entry in
 * docs/api-contract.md or docs/types.ts either. Both `suggest-codes` and
 * `icd-codes` drifted in exactly that way. springdoc generates the spec from
 * the controller annotations, so this assertion is the ONLY thing making the
 * docs keep up: adding an endpoint now fails the build until it is documented.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OpenApiDocsTest {

    private static final List<String> EXPECTED_PATHS = List.of(
            "/api/health",
            "/api/healthz",
            "/api/cases",
            "/api/cases/{caseId}",
            "/api/cases/{caseId}/codes",
            "/api/cases/approve",
            "/api/cases/{caseId}/reopen",
            "/api/cases/{caseId}/suggest-codes",
            "/api/demo/reset",
            "/api/demo/snapshot",
            "/api/sync",
            "/api/cases/{caseId}/sync",
            "/api/icd-codes",
            "/api/auth/login",
            "/api/auth/logout",
            "/api/auth/me",
            "/api/admin/accounts",
            "/api/admin/accounts/{id}",
            "/api/admin/accounts/{id}/status",
            "/api/admin/dashboard",
            "/api/admin/knowledge/docs",
            "/api/admin/knowledge/docs/{source}",
            "/api/admin/knowledge/stats",
            "/api/admin/knowledge/train",
            "/api/admin/knowledge/sync-codes",
            "/api/admin/knowledge/retrieve",
            "/api/admin/knowledge/chat",
            "/api/agent/chat");

    @Autowired
    private MockMvc mvc;

    private final JsonMapper json = new JsonMapper();

    @Test
    void apiDocsListEveryEndpoint() throws Exception {
        String body = mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        JsonNode paths = json.readTree(body).get("paths");
        for (String path : EXPECTED_PATHS) {
            assertTrue(paths.has(path), "OpenAPI spec is missing " + path
                    + " — document it on the controller method");
        }
        // The other direction: an endpoint that exists but nobody listed here.
        for (String path : paths.propertyNames()) {
            assertTrue(EXPECTED_PATHS.contains(path), path + " is served but not listed in "
                    + "EXPECTED_PATHS — document it in docs/api-contract.md and "
                    + "docs/types.ts, then add it here");
        }
    }
}
