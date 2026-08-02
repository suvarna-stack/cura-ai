package com.medcodeai.imedmock.web;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Demo tooling (mock-only — NOT part of the hospital contract): freeze the
 * whole imed database as the "demo start" baseline and restore it on demand.
 *
 * snapshot: copies every imed.* table into the imed_baseline schema
 * (CREATE TABLE AS), replacing any previous baseline.
 * reset: truncates every imed.* table and refills it from imed_baseline —
 * i.e. undoes everything the demo wrote back (diagnosis rows, discharges,
 * coding status, request log) and restores exactly the snapshotted cases.
 *
 * medcode-api's POST /api/demo/reset calls our reset so ONE button restores
 * both sides. All ids here are text (no sequences to re-align).
 */
@RestController
@Tag(name = "Demo baseline (mock-only)",
        description = "Snapshot/restore the hospital DB for repeatable demos — not in the real iMed contract")
public class DemoBaselineController {

    private final JdbcTemplate jdbc;

    public DemoBaselineController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private List<String> liveTables() {
        return jdbc.queryForList(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'imed' ORDER BY tablename",
                String.class);
    }

    private List<String> baselineTables() {
        return jdbc.queryForList(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'imed_baseline' ORDER BY tablename",
                String.class);
    }

    @PostMapping("/api/demo/snapshot")
    @Transactional
    @Operation(summary = "Freeze the current hospital DB as the demo baseline",
            description = "Copies every imed.* table into the imed_baseline schema, replacing any "
                    + "previous baseline. Run once when the DB is in the state the demo should start from.")
    @ApiResponse(responseCode = "200", description = "{ok, tables} — per-table snapshotted row counts")
    public Map<String, Object> snapshot() {
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS imed_baseline");
        Map<String, Object> tables = new LinkedHashMap<>();
        for (String t : liveTables()) {
            jdbc.execute("DROP TABLE IF EXISTS imed_baseline." + t);
            jdbc.execute("CREATE TABLE imed_baseline." + t + " AS TABLE imed." + t);
            tables.put(t, jdbc.queryForObject("SELECT count(*) FROM imed_baseline." + t, Long.class));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("tables", tables);
        return out;
    }

    @PostMapping("/api/demo/reset")
    @Transactional
    @Operation(summary = "Restore the hospital DB to the demo baseline",
            description = "Truncates every imed.* table and refills it from the imed_baseline schema — "
                    + "undoing all write-backs since the snapshot. 409 if no snapshot exists yet.")
    @ApiResponse(responseCode = "200", description = "{ok, tables} — per-table restored row counts")
    @ApiResponse(responseCode = "400", description = "No baseline snapshot exists yet")
    public Map<String, Object> reset() {
        List<String> baseline = baselineTables();
        if (baseline.isEmpty()) {
            throw new ApiExceptionHandler.ImedBusinessException(
                    "no demo baseline — POST /api/demo/snapshot first");
        }
        List<String> live = liveTables();
        // one statement so Postgres resolves any FK ordering between tables
        jdbc.execute("TRUNCATE " + String.join(", ", live.stream().map(t -> "imed." + t).toList()));
        Map<String, Object> tables = new LinkedHashMap<>();
        for (String t : live) {
            if (baseline.contains(t)) {
                jdbc.execute("INSERT INTO imed." + t + " SELECT * FROM imed_baseline." + t);
                tables.put(t, jdbc.queryForObject("SELECT count(*) FROM imed." + t, Long.class));
            } else {
                tables.put(t, 0L);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("tables", tables);
        return out;
    }
}
