package com.medcodeai.api.service;

import com.medcodeai.api.client.ImedApiClient;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Demo baseline — freeze the "demo start" state of BOTH databases and restore
 * it with one call (the Settings reset button). Replaces the retired
 * approvals-replay reset from the run_demo era (which assumed a demo.coder
 * baseline that no longer exists).
 *
 * snapshot: copies the medcode tables into the demo_baseline schema (CREATE
 * TABLE AS, replacing any previous baseline), then tells imed-mock-api to do
 * the same for the hospital DB (imed_baseline schema).
 *
 * reset: truncates + refills every baselined medcode table, prunes accounts
 * created after the snapshot (their sessions too), re-aligns the serial
 * sequences, invalidates the cases cache — then tells imed-mock-api to
 * restore the hospital side. Same two-phase order as approve: our commit
 * first, then the hospital call; a hospital failure 500s with our side done,
 * and re-running the reset heals (both restores are idempotent).
 *
 * auth_sessions is deliberately NOT part of the baseline: the demo operator
 * stays logged in through a reset (only sessions of pruned accounts die).
 */
@Service
public class DemoBaselineService {

    /** FK-safe restore order: users/lookups → cases → per-case children. */
    private static final List<String> TABLES = List.of(
            "users", "coverage_types", "icd_10", "icd_9",
            "cases", "case_codes", "case_code_edits", "case_orders",
            "case_report_sections", "case_vitals",
            "coding_history", "document_chunks", "imed_write_ops", "knowledge_base");

    /** table → serial PK column, for post-restore sequence re-alignment. */
    private static final Map<String, String> SERIAL_PK = Map.ofEntries(
            Map.entry("users", "user_id"),
            Map.entry("icd_10", "icd_10_id"),
            Map.entry("icd_9", "icd_9_id"),
            Map.entry("case_codes", "case_code_id"),
            Map.entry("case_orders", "order_id"),
            Map.entry("case_report_sections", "section_id"),
            Map.entry("case_vitals", "vital_id"),
            Map.entry("coding_history", "history_id"),
            Map.entry("document_chunks", "chunk_id"),
            Map.entry("imed_write_ops", "op_id"),
            Map.entry("knowledge_base", "knowledge_id"));

    private final JdbcTemplate jdbc;
    private final ImedApiClient imed;
    private final WriteGate writeGate;
    private final CasesCache cache;
    private final TransactionTemplate tx;

    public DemoBaselineService(JdbcTemplate jdbc, ImedApiClient imed, WriteGate writeGate,
                               CasesCache cache, PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.imed = imed;
        this.writeGate = writeGate;
        this.cache = cache;
        this.tx = new TransactionTemplate(txManager);
    }

    public Map<String, Object> snapshot() {
        Map<String, Object> ours = writeGate.locked(() -> tx.execute(status -> {
            jdbc.execute("CREATE SCHEMA IF NOT EXISTS demo_baseline");
            Map<String, Object> counts = new LinkedHashMap<>();
            for (String t : TABLES) {
                jdbc.execute("DROP TABLE IF EXISTS demo_baseline." + t);
                jdbc.execute("CREATE TABLE demo_baseline." + t + " AS TABLE public." + t);
                counts.put(t, jdbc.queryForObject("SELECT count(*) FROM demo_baseline." + t, Long.class));
            }
            return counts;
        }));
        Map<String, Object> theirs = imed.demoSnapshot();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("medcodeTables", ours);
        out.put("imedTables", theirs.get("tables"));
        return out;
    }

    public Map<String, Object> reset() {
        Map<String, Object> ours = writeGate.locked(() -> tx.execute(status -> {
            if (jdbc.queryForList("SELECT 1 FROM pg_tables WHERE schemaname = 'demo_baseline' LIMIT 1")
                    .isEmpty()) {
                throw new com.medcodeai.api.web.ApiExceptionHandler.ConflictException(
                        "no demo baseline — POST /api/demo/snapshot first");
            }
            // one statement so Postgres orders the FK web itself; users stays
            // (pruned + upserted below so live sessions survive)
            jdbc.execute("TRUNCATE " + String.join(", ",
                    TABLES.stream().filter(t -> !"users".equals(t)).toList()));

            // accounts created after the snapshot go away, sessions first (FK)
            jdbc.update("DELETE FROM auth_sessions WHERE user_id NOT IN "
                    + "(SELECT user_id FROM demo_baseline.users)");
            jdbc.update("DELETE FROM users WHERE user_id NOT IN "
                    + "(SELECT user_id FROM demo_baseline.users)");
            jdbc.update("""
                    INSERT INTO users (user_id, email, oauth_provider, oauth_subject, full_name,
                                       role, status, created_at, last_login_at, password_hash)
                    SELECT user_id, email, oauth_provider, oauth_subject, full_name,
                           role, status, created_at, last_login_at, password_hash
                    FROM demo_baseline.users
                    ON CONFLICT (user_id) DO UPDATE SET
                        email = EXCLUDED.email, oauth_provider = EXCLUDED.oauth_provider,
                        oauth_subject = EXCLUDED.oauth_subject, full_name = EXCLUDED.full_name,
                        role = EXCLUDED.role, status = EXCLUDED.status,
                        created_at = EXCLUDED.created_at, last_login_at = EXCLUDED.last_login_at,
                        password_hash = EXCLUDED.password_hash""");

            Map<String, Object> counts = new LinkedHashMap<>();
            for (String t : TABLES) {
                if (!"users".equals(t)) {
                    jdbc.execute("INSERT INTO public." + t + " SELECT * FROM demo_baseline." + t);
                }
                counts.put(t, jdbc.queryForObject("SELECT count(*) FROM public." + t, Long.class));
            }
            for (Map.Entry<String, String> e : SERIAL_PK.entrySet()) {
                jdbc.execute("SELECT setval(pg_get_serial_sequence('public.%s', '%s'), "
                        .formatted(e.getKey(), e.getValue())
                        + "COALESCE((SELECT MAX(%s) FROM public.%s), 0) + 1, false)"
                        .formatted(e.getValue(), e.getKey()));
            }
            return counts;
        }));
        cache.invalidate();
        Map<String, Object> theirs = imed.demoReset(); // two-phase: after our commit
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("medcodeTables", ours);
        out.put("imedTables", theirs.get("tables"));
        return out;
    }
}
