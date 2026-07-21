package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * UI working-state tables: case_code_edits (payload JSONB) and
 * case_report_drafts. SQL from server/app.py (each method cites its line).
 * payload is read ::text so the service re-parses it exactly like Flask's
 * json.loads, and written via setString (stringtype=unspecified coerces it
 * into JSONB, like psycopg2).
 */
@Repository
public class WorkingStateRepository {

    private final JdbcTemplate jdbc;

    public WorkingStateRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // app.py:197 load_working_state() — saved edits payload, or null
    public String loadEditsPayload(String caseId) {
        List<String> rows = jdbc.queryForList(
                "SELECT payload::text FROM case_code_edits WHERE case_id=?", String.class, caseId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // app.py:199 load_working_state() — saved report draft, or null
    public String loadDraft(String caseId) {
        List<String> rows = jdbc.queryForList(
                "SELECT draft FROM case_report_drafts WHERE case_id=?", String.class, caseId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // app.py:266 put_codes() upsert
    public void upsertEdits(String caseId, String payloadJson, String now) {
        jdbc.update("""
                INSERT INTO case_code_edits (case_id, payload, updated_at) VALUES (?,?,?)
                ON CONFLICT (case_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at""",
                caseId, payloadJson, now);
    }

    // app.py:287 put_draft() upsert
    public void upsertDraft(String caseId, String draft, String now) {
        jdbc.update("""
                INSERT INTO case_report_drafts (case_id, draft, updated_at) VALUES (?,?,?)
                ON CONFLICT (case_id) DO UPDATE SET draft=excluded.draft, updated_at=excluded.updated_at""",
                caseId, draft, now);
    }
}
