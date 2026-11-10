package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * UI working-state table: case_code_edits (payload JSONB). SQL from
 * server/app.py (each method cites its line). payload is read ::text so the
 * service re-parses it exactly like Flask's json.loads, and written via
 * setString (stringtype=unspecified coerces it into JSONB, like psycopg2).
 * (case_report_drafts was dropped 2026-08-02 — the report is read-only.)
 */
@Repository
public class WorkingStateRepository {

    private final JdbcTemplate jdbc;
    private final JsonMapper json = new JsonMapper();

    public WorkingStateRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // app.py:197 load_working_state() — saved edits payload, or null
    public String loadEditsPayload(String caseId) {
        List<String> rows = jdbc.queryForList(
                "SELECT payload::text FROM case_code_edits WHERE case_id=?", String.class, caseId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // app.py:266 put_codes() upsert
    public void upsertEdits(String caseId, String payloadJson, String now) {
        jdbc.update("""
                INSERT INTO case_code_edits (case_id, payload, updated_at) VALUES (?,?,?)
                ON CONFLICT (case_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at""",
                caseId, payloadJson, now);
    }

    /** case_id → average of code `confidence` fields in the saved edits payload. */
    public Map<String, Integer> avgConfidenceByCase() {
        Map<String, Integer> out = new HashMap<>();
        jdbc.query("SELECT case_id, payload::text AS payload FROM case_code_edits", rs -> {
            Integer avg = averageConfidence(rs.getString("payload"));
            if (avg != null) {
                out.put(rs.getString("case_id"), avg);
            }
        });
        return out;
    }

    private Integer averageConfidence(String payloadJson) {
        if (payloadJson == null || payloadJson.isBlank()) {
            return null;
        }
        try {
            Object parsed = json.readValue(payloadJson, Object.class);
            if (!(parsed instanceof List<?> list) || list.isEmpty()) {
                return null;
            }
            int sum = 0;
            int n = 0;
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) {
                    continue;
                }
                if (Boolean.TRUE.equals(m.get("missing"))) {
                    continue;
                }
                Object conf = m.get("confidence");
                if (conf instanceof Number num) {
                    sum += num.intValue();
                    n++;
                }
            }
            return n == 0 ? null : Math.round(sum / (float) n);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
