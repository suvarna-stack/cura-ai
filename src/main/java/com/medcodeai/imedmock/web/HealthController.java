package com.medcodeai.imedmock.web;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Part of the published API contract, kept stable for existing callers.
 * Container probes should prefer Actuator's /actuator/health/{liveness,
 * readiness} — the readiness group includes the DB check (see application.yml).
 */
@RestController
@Tag(name = "Health")
public class HealthController {

    private final JdbcClient db;

    public HealthController(JdbcClient db) {
        this.db = db;
    }

    // smoke test, no DB touch
    @GetMapping("/api/health")
    @Operation(summary = "Liveness smoke test (no DB access)")
    public Map<String, Object> health() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    // real query against the extract data
    @GetMapping("/api/healthz")
    @Operation(summary = "Readiness check — real COUNT(*) against MedHack_Patient")
    public Map<String, Object> healthz() {
        Integer n = db.sql("SELECT COUNT(*) FROM imed.medhack_patient").query(Integer.class).single();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("patients", n);
        out.put("db", "pg");
        return out;
    }
}
