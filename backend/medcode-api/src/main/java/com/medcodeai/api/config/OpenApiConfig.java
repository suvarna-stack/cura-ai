package com.medcodeai.api.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger UI metadata. This exists for hands-on poking of the API (the
 * "try it out" console), NOT as a machine-readable contract: the endpoints
 * return LinkedHashMap and take raw bodies, so the generated schemas are bare
 * "object" and the real shapes live in the hand-written @ExampleObject bodies
 * on each controller method. docs/api-contract.md stays the source of truth.
 *
 * The "bearerAuth" security scheme below powers the UI's Authorize button:
 * log in via POST /api/auth/login, paste the returned token once, and it rides
 * on the guarded endpoints (the ones tagged with @SecurityRequirement —
 * /api/auth/{me,logout} and all of /api/admin/**). The public endpoints carry
 * no requirement, so they show no lock.
 *
 * Only registered when SWAGGER_ENABLED is unset or true (application.yml).
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI medcodeOpenAPI() {
        return new OpenAPI()
                .components(new Components().addSecuritySchemes("bearerAuth",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .description("Paste the `token` from POST /api/auth/login "
                                        + "(no \"Bearer \" prefix — Swagger adds it).")))
                .info(new Info()
                .title("medcode-api")
                .version("0.0.1-SNAPSHOT")
                .description("""
                        Backend for the MedCode AI medical-coding audit dashboard.

                        **`docs/api-contract.md` in this repo is the source of truth** \
                        (TypeScript mirror: `docs/types.ts`). The request/response \
                        examples shown here are illustrative copies of it, trimmed for \
                        readability — they are not generated from the code and are not \
                        a contract. Where a schema says `object`, see the example.

                        Every value served is real DB data; fields with no real source \
                        are `null` (`patient`, `confidence`, `revenue_impact`) or a \
                        documented placeholder (`drg: "—"`).

                        Errors: `400`/`404` return `{"error": "…"}`. A `500` on \
                        approve/reopen means our DB committed but the hospital iMed \
                        call failed — both actions are idempotent, so retry to heal.

                        This UI is a local-dev tool and is disabled in containers \
                        (`SWAGGER_ENABLED=false`).
                        """));
    }
}
