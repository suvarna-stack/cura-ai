package com.medcodeai.imedmock.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.context.annotation.Configuration;

/**
 * Metadata for the generated OpenAPI document.
 *
 * The point of this app is to BE the integration spec, so the spec should be
 * generated from the running code rather than maintained by hand — the README
 * table can drift, /v3/api-docs.yaml cannot. Hand that YAML to the hospital's
 * integrators; it is the contract their production API must satisfy.
 */
@Configuration
@OpenAPIDefinition(info = @Info(title = "iMed hospital API (mock)", version = "0.0.1", description = """
        The HTTP endpoints the hospital must provide in production, \
        implemented as a live example over real sample extract data.

        READ endpoints serve case data one endpoint per extract table — \
        rows verbatim: exact extract column names, all values as stored \
        (TEXT; the extracts' datetime formats are non-uniform, so parsing \
        is the consumer's job).

        WRITE endpoints receive MedCode AI's approval results. The \
        write-back is deliberately limited to two things: the case coding \
        status and the finalized ICD codes, stored as NEW rows prefixed \
        'MCAI-'. Clinical notes and hospital-entered codes are never modified.

        Auth: none in this mock. The production API will need \
        authentication — scheme TBD with the hospital."""))
public class OpenApiConfig {
}
