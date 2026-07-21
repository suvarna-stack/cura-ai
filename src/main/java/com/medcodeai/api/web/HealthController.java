package com.medcodeai.api.web;

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

    // app.py:211 — smoke test, no DB touch
    @GetMapping("/api/health")
    public Map<String, Object> health() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    // app.py:216 — keep-alive for an uptime pinger. Deliberately a real query,
    // never the cases cache: the same ping that keeps the Render instance warm
    // must also count as DB activity for Supabase's free-tier pause clock.
    @GetMapping("/api/healthz")
    public Map<String, Object> healthz() {
        Integer n = db.sql("SELECT COUNT(*) FROM cases").query(Integer.class).single();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("cases", n);
        out.put("db", "pg");
        return out;
    }
}
