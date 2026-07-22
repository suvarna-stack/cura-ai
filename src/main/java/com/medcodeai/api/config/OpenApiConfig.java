package com.medcodeai.api.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger UI metadata. This exists for hands-on poking of the API (the
 * "try it out" console), NOT as a machine-readable contract: the endpoints
 * return LinkedHashMap and take raw bodies, so the generated schemas are bare
 * "object" and the real shapes live in the hand-written @ExampleObject bodies
 * on each controller method. docs/api-contract.md stays the source of truth.
 *
 * Only registered when SWAGGER_ENABLED is unset or true (application.yml).
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI medcodeOpenAPI() {
        return new OpenAPI().info(new Info()
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
