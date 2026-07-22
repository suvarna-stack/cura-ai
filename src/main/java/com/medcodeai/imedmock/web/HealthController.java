package com.medcodeai.imedmock.web;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class HealthController {

    private final JdbcClient db;

    public HealthController(JdbcClient db) {
        this.db = db;
    }

    // smoke test, no DB touch
    @GetMapping("/api/health")
    public Map<String, Object> health() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    // real query — usable as the container liveness check
    @GetMapping("/api/healthz")
    public Map<String, Object> healthz() {
        Integer n = db.sql("SELECT COUNT(*) FROM imed.medhack_patient").query(Integer.class).single();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("patients", n);
        out.put("db", "pg");
        return out;
    }
}
