package com.medcodeai.api.web;

import com.medcodeai.api.service.AccountService;
import com.medcodeai.api.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.net.URI;
import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin-role gate must follow Spring's own route matching, not the raw
 * request URI. Spring decodes each path segment before it picks a controller,
 * so "/api/%61dmin/accounts" reaches the admin controller — and a role check
 * that string-compares the raw URI never sees "/api/admin/" there.
 *
 * Web layer only (no database): the token lookup and the account list are
 * mocked, the interceptors and their registration in WebConfig are real.
 */
@WebMvcTest(AdminController.class)
class AdminRouteRoleTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private AuthService auth;

    @MockitoBean
    private AccountService accounts;

    @BeforeEach
    void tokens() {
        when(auth.authenticate("coder-token"))
                .thenReturn(new AuthService.Principal(2, "coder@test", "Coder", "coder", "s-coder"));
        when(auth.authenticate("admin-token"))
                .thenReturn(new AuthService.Principal(1, "admin@test", "Admin", "admin", "s-admin"));
        when(accounts.list()).thenReturn(List.of());
    }

    @Test
    void coderIsRefusedOnAnAdminRoute() throws Exception {
        mvc.perform(get("/api/admin/accounts").header("Authorization", "Bearer coder-token"))
                .andExpect(status().isForbidden());
    }

    @Test
    void coderIsRefusedOnAnEncodedAdminRoute() throws Exception {
        mvc.perform(get(URI.create("/api/%61dmin/accounts")).header("Authorization", "Bearer coder-token"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminIsAllowed() throws Exception {
        mvc.perform(get("/api/admin/accounts").header("Authorization", "Bearer admin-token"))
                .andExpect(status().isOk());
        mvc.perform(get(URI.create("/api/%61dmin/accounts")).header("Authorization", "Bearer admin-token"))
                .andExpect(status().isOk());
    }

    @Test
    void noTokenIsUnauthorized() throws Exception {
        mvc.perform(get(URI.create("/api/%61dmin/accounts")))
                .andExpect(status().isUnauthorized());
    }
}
