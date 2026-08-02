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
 * table can drift, /v3/api-docs.yaml cannot. Hand that YAML to the hospital's
 * integrators; it is the contract their production API must satisfy (for the
 * /api/v1 write surface it mirrors THEIR own PDF back at them exactly —
 * the invented coding-status extension was withdrawn 2026-08-02).
 */
@Configuration
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer",
        description = "Static mock token from IMED_API_TOKEN (default \"imed-mock-token\"). "
                + "The real API's token issuance is the hospital's — TBD.")
@OpenAPIDefinition(info = @Info(title = "iMed hospital API (mock)", version = "0.0.2", description = """
        The HTTP surface between MedCode AI and the hospital, implemented as \
        a live example over real sample extract data.

        READ endpoints serve case data one endpoint per extract table — \
        rows verbatim: exact extract column names, all values as stored \
        (TEXT; the extracts' datetime formats are non-uniform, so parsing \
        is the consumer's job). Cancelled diagnosis/procedure rows are \
        excluded. No auth on reads in this mock (production read auth TBD).

        WRITE endpoints under /api/v1 mock the hospital's REAL contract — \
        "iMed Diagnosis and Medical Discharge API" (rev 1, 24 Jul 2026): \
        POST creates ICD-10/ICD-9 rows + medical discharge in one \
        transaction (ids generated and returned), PUT edits by object_id, \
        DELETE cancels a single row via the cancel flow. Bearer auth, \
        request_id dedup, {request_id, status, result} envelopes, \
        409 DIAGNOSIS_CODE_ALREADY_EXIST."""))
public class OpenApiConfig {
}
