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
 * a Spring Boot / Jackson upgrade) and that every route is listed, so a new
 * endpoint can't ship undocumented. Response SHAPE is CasesApiIntegrationTest's
 * job — the examples in the annotations are illustrative, not asserted.
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
            "/api/cases/{caseId}/draft",
            "/api/cases/approve",
            "/api/cases/{caseId}/reopen",
            "/api/demo/reset");

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
    }
}
