package com.medcodeai.imedmock.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

/**
 * Metadata for the generated OpenAPI document.
 *
 * The point of this app is to BE the integration spec, so the spec should be
 * generated from the running code rather than maintained by hand — the README
 * table can drift, /v3/api-docs.yaml cannot. Since 2026-11-09 the spec it
 * mirrors is the hospital's own "MedCode กับ Medihack API" guide (4 Nov 2026).
 */
@Configuration
@SecurityScheme(name = "basicAuth", type = SecuritySchemeType.HTTP, scheme = "basic",
        description = "client_id:client_secret — only for POST /auth/token. Mock defaults: "
                + "IMED_CLIENT_ID / IMED_CLIENT_SECRET (medcode-mock-client / medcode-mock-secret).")
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer",
        description = "The access_token from POST /auth/token. Expires after expires_in seconds "
                + "(IMED_TOKEN_TTL_SECONDS, default 300).")
@OpenAPIDefinition(info = @Info(title = "iMed hospital API (mock)", version = "0.0.3", description = """
        The HTTP surface between MedCode AI and the hospital, mocked to the \
        hospital's Medihack API guide for MedCode (4 Nov 2026).

        AUTH: POST /auth/token with Basic client credentials and \
        grant_type=client_credentials returns a short-lived Bearer token; \
        every /api/v1 route requires it.

        READ: /cases/sync (by visit ids, at most 20), /cases/sync-by-period \
        (at most 31 days), the ICD-10/ICD-9 catalogues and /contract/check. \
        Date-times are ISO 8601 with the +07:00 offset; cancelled \
        diagnosis/procedure rows never appear.

        WRITE: POST /diagnosis, PUT /diagnosis/{visit_id}, DELETE one ICD-10 \
        or ICD-9 row — validated to the guide's rules. Unlike the hospital's \
        own mock (which answers mock: true and stores nothing), these writes \
        are REAL: they persist and show up in the reads, so approve/reopen \
        round trips can be tested end to end."""))
public class OpenApiConfig {
}
