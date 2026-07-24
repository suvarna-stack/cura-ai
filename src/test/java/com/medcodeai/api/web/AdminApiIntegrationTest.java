package com.medcodeai.api.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

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
 * Drives the auth + admin-account endpoints against the local seeded "medcode"
 * Postgres (same MockMvc, no-mocks style as CasesApiIntegrationTest). The
 * bootstrap admin is created by SchemaBootstrap at startup from the default
 * ADMIN_BOOTSTRAP_* values, so these tests log in with that known default.
 *
 * Create/delete tests use a unique email per run (self-cleaning). The one test
 * that exercises the delete-guard needs an account with real coding history,
 * which is permanent by design — it reuses a FIXED coder id so at most one
 * un-deletable row ever accumulates.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminApiIntegrationTest {

    private static final String ADMIN_EMAIL = "admin@medcodeai.demo";
    private static final String ADMIN_PW = "admin1234"; // SchemaBootstrap's documented default

    @Autowired
    private MockMvc mvc;

    private final JsonMapper json = new JsonMapper();

    @Test
    void loginReturnsTokenAndMeReportsTheAdmin() throws Exception {
        String token = login(ADMIN_EMAIL, ADMIN_PW);

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(ADMIN_EMAIL))
                .andExpect(jsonPath("$.role").value("admin"))
                .andExpect(jsonPath("$.status").value("active"));
    }

    @Test
    void badCredentialsReturn401() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + ADMIN_EMAIL + "\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid email or password"));
    }

    @Test
    void adminEndpointWithoutTokenIs401() throws Exception {
        mvc.perform(get("/api/admin/accounts"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void loginRateLimitTripsAfterRepeatedFailures() throws Exception {
        // unique unknown email so this can't lock out any account other tests use.
        // Default LOGIN_MAX_ATTEMPTS = 5: five 401s, then the sixth is locked out.
        String email = "ratelimit-" + System.nanoTime() + "@example.com";
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"" + email + "\",\"password\":\"nope" + i + "\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"nope\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("too many failed login attempts — try again later"));
    }

    @Test
    void dashboardReturnsTheFourCards() throws Exception {
        String token = login(ADMIN_EMAIL, ADMIN_PW);
        mvc.perform(get("/api/admin/dashboard").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCoderAccounts").isNumber())
                .andExpect(jsonPath("$.activeToday").isNumber())
                .andExpect(jsonPath("$.totalCases").isNumber())
                .andExpect(jsonPath("$.systemStatus").value("operational"));
    }

    @Test
    void createUpdateStatusDeleteRoundTrip() throws Exception {
        String token = login(ADMIN_EMAIL, ADMIN_PW);
        String email = uniqueEmail();
        int id = createAccount(token, "Round Trip", email, "password1", "coder");

        // it shows up in the list
        assertTrue(containsEmail(adminArray(token, "/api/admin/accounts"), email),
                "created account should appear in the list");

        // edit: rename + promote to admin
        mvc.perform(put("/api/admin/accounts/{id}", id).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"Renamed\",\"role\":\"admin\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Renamed"))
                .andExpect(jsonPath("$.role").value("admin"));

        // toggle inactive
        mvc.perform(put("/api/admin/accounts/{id}/status", id).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"inactive\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("inactive"));

        // delete (no coding history -> allowed) and confirm it's gone
        mvc.perform(delete("/api/admin/accounts/{id}", id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
        assertFalse(containsEmail(adminArray(token, "/api/admin/accounts"), email),
                "deleted account should be gone from the list");
    }

    @Test
    void duplicateEmailIs409() throws Exception {
        String token = login(ADMIN_EMAIL, ADMIN_PW);
        String email = uniqueEmail();
        int id = createAccount(token, "First", email, "password1", "coder");

        mvc.perform(post("/api/admin/accounts").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(accountBody("Second", email, "password1", "coder")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("an account with this email already exists"));

        mvc.perform(delete("/api/admin/accounts/{id}", id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void shortPasswordIs400() throws Exception {
        String token = login(ADMIN_EMAIL, ADMIN_PW);
        mvc.perform(post("/api/admin/accounts").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(accountBody("Weak Pw", uniqueEmail(), "short", "coder")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("password must be at least 8 characters"));
    }

    @Test
    void coderTokenIsForbiddenOnAdminButCanReadMe() throws Exception {
        String adminToken = login(ADMIN_EMAIL, ADMIN_PW);
        String email = uniqueEmail();
        int id = createAccount(adminToken, "Just A Coder", email, "coderpass1", "coder");

        String coderToken = login(email, "coderpass1");

        // /api/auth/me works for any active user
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + coderToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("coder"));

        // ...but the admin routes are 403 for a coder
        mvc.perform(get("/api/admin/accounts").header("Authorization", "Bearer " + coderToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("forbidden"));

        mvc.perform(delete("/api/admin/accounts/{id}", id).header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());
    }

    @Test
    void logoutInvalidatesTheToken() throws Exception {
        String token = login(ADMIN_EMAIL, ADMIN_PW);
        mvc.perform(get("/api/admin/dashboard").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        mvc.perform(get("/api/admin/dashboard").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void deletingAnAccountWithCodingHistoryIs409() throws Exception {
        String token = login(ADMIN_EMAIL, ADMIN_PW);

        // give the coder "history-guard" real coding history via the public approve
        // flow (it auto-creates the user), then reopen to leave the case as it was.
        // The code_assigned history rows survive reopen, so the account stays
        // referenced — and thus protected from deletion.
        String openId = getJson("/api/cases").get("complete").get(0).get("id").asString();
        mvc.perform(post("/api/cases/approve").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + openId + "\"],\"coder\":\"history-guard\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/cases/{id}/reopen", openId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"coder\":\"history-guard\"}"))
                .andExpect(status().isOk());

        Integer id = idByEmail(adminArray(token, "/api/admin/accounts"), "history-guard@medcodeai.demo");
        assertNotNull(id, "approve should have created the history-guard user");

        mvc.perform(delete("/api/admin/accounts/{id}", id).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error")
                        .value("this account has coding history and cannot be deleted — deactivate it instead"));
    }

    // ---- helpers ----

    private String login(String email, String password) throws Exception {
        String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("token").asString();
    }

    private int createAccount(String token, String fullName, String email, String password, String role)
            throws Exception {
        String body = mvc.perform(post("/api/admin/accounts").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(accountBody(fullName, email, password, role)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("id").asInt();
    }

    private static String accountBody(String fullName, String email, String password, String role) {
        return "{\"fullName\":\"" + fullName + "\",\"email\":\"" + email
                + "\",\"password\":\"" + password + "\",\"role\":\"" + role + "\"}";
    }

    private static String uniqueEmail() {
        return "itest-" + System.nanoTime() + "@example.com";
    }

    private JsonNode adminArray(String token, String url) throws Exception {
        String body = mvc.perform(get(url).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private JsonNode getJson(String url) throws Exception {
        String body = mvc.perform(get(url))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private static boolean containsEmail(JsonNode accounts, String email) {
        for (JsonNode a : accounts) {
            if (email.equals(a.get("email").asString())) {
                return true;
            }
        }
        return false;
    }

    private static Integer idByEmail(JsonNode accounts, String email) {
        for (JsonNode a : accounts) {
            if (email.equals(a.get("email").asString())) {
                return a.get("id").asInt();
            }
        }
        return null;
    }
}
