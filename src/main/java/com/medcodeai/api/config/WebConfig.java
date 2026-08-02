package com.medcodeai.api.config;

import com.medcodeai.api.web.AuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Wires the auth gate onto the guarded routes. CORS lives in its own
 * WebMvcConfigurer (CorsConfig); a second one purely for interceptors is fine.
 *
 * Since 2026-07-25 (Phase 3 decision) the CASE SURFACE is guarded too: every
 * case read/write, sync, and demo route requires a valid token (any role) —
 * the coder frontend now logs in, so the "admin-only, cases stay public"
 * scope from the first auth milestone is over. /api/admin/** additionally
 * requires the admin role (enforced inside AuthInterceptor).
 *
 * Deliberately public: /api/auth/login (can't require a token), /api/health +
 * /api/healthz (uptime probes), and Swagger (local-dev only).
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;

    public WebConfig(AuthInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/admin/**", "/api/auth/me", "/api/auth/logout",
                        "/api/cases/**", "/api/cases", "/api/sync", "/api/demo/reset",
                        "/api/demo/snapshot", "/api/icd-codes", "/api/icd-codes/**");
    }
}
