package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Catalog-style access to icd_10 / icd_9 for the knowledge sync (bulk upsert
 * of code + official-title pairs extracted from uploaded reference documents).
 * Kept separate from CodingRepository, whose catalog methods serve the
 * per-case approval workflow.
 *
 * Callers still speak in (code, system) pairs; since the 2026-07-28 split the
 * system picks the TABLE rather than filling a column, so each batch is
 * partitioned before it hits the driver.
 */
@Repository
public class IcdCatalogRepository {

    private final JdbcTemplate jdbc;

    public IcdCatalogRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** "code|system" -> current description ("" for null) for every known code. */
    public Map<String, String> existingDescriptions() {
        Map<String, String> out = new HashMap<>();
        for (IcdSystem s : IcdSystem.values()) {
            jdbc.query(s == IcdSystem.ICD_9
                            ? "SELECT code, description FROM icd_9"
                            : "SELECT code, description FROM icd_10",
                    rs -> {
                        String d = rs.getString("description");
                        out.put(rs.getString("code") + "|" + s.label(), d == null ? "" : d);
                    });
        }
        return out;
    }

    /** Bulk-insert new catalog rows: [code, system, description]. */
    public void insertCodes(List<Object[]> rows) {
        batchPerSystem(rows, 1,
                "INSERT INTO icd_10 (code, description) VALUES (?,?) ON CONFLICT (code) DO NOTHING",
                "INSERT INTO icd_9 (code, description) VALUES (?,?) ON CONFLICT (code) DO NOTHING",
                r -> new Object[]{r[0], r[2]});
    }

    /** Fill descriptions that are currently null/blank: [description, code, system]. */
    public void fillDescriptions(List<Object[]> rows) {
        batchPerSystem(rows, 2,
                "UPDATE icd_10 SET description = ? WHERE code = ? AND (description IS NULL OR description = '')",
                "UPDATE icd_9 SET description = ? WHERE code = ? AND (description IS NULL OR description = '')",
                r -> new Object[]{r[0], r[1]});
    }

    /**
     * Split one batch across the two catalog tables. The caller's rows still
     * carry the system label (the shape KnowledgeCodeSyncService builds); since
     * the 2026-07-28 split it selects the table instead of being a column, so it
     * is dropped from the arguments by {@code toArgs}.
     */
    private void batchPerSystem(List<Object[]> rows, int systemIdx, String sqlIcd10, String sqlIcd9,
                                Function<Object[], Object[]> toArgs) {
        List<Object[]> ten = new ArrayList<>();
        List<Object[]> nine = new ArrayList<>();
        for (Object[] r : rows) {
            IcdSystem s = IcdSystem.of((String) r[systemIdx]);
            (s == IcdSystem.ICD_9 ? nine : ten).add(toArgs.apply(r));
        }
        if (!ten.isEmpty()) {
            jdbc.batchUpdate(sqlIcd10, ten);
        }
        if (!nine.isEmpty()) {
            jdbc.batchUpdate(sqlIcd9, nine);
        }
    }

    /**
     * Typeahead search over the catalog. Matches code or description (case-insensitive).
     * Optional {@code system} filters to ICD-10 / ICD-9. Prefers prefix matches on code.
     */
    public List<Map<String, Object>> search(String q, String system, int limit) {
        String query = q == null ? "" : q.trim();
        if (query.isEmpty()) {
            return List.of();
        }
        int cap = Math.max(1, Math.min(limit, 40));
        String like = "%" + query + "%";
        String prefix = query + "%";
        if (system != null && !system.isBlank()) {
            return jdbc.query("""
                            SELECT code, code_system::text AS system,
                                   COALESCE(description, '') AS description
                            FROM icd_codes
                            WHERE code_system::text = ?
                              AND (code ILIKE ? OR COALESCE(description, '') ILIKE ?)
                            ORDER BY CASE WHEN code ILIKE ? THEN 0
                                          WHEN code ILIKE ? THEN 1
                                          ELSE 2 END,
                                     code
                            LIMIT ?
                            """,
                    (rs, i) -> {
                        Map<String, Object> m = new java.util.LinkedHashMap<>();
                        m.put("code", rs.getString("code"));
                        m.put("system", rs.getString("system"));
                        m.put("description", rs.getString("description"));
                        return m;
                    },
                    system, like, like, query, prefix, cap);
        }
        return jdbc.query("""
                        SELECT code, code_system::text AS system,
                               COALESCE(description, '') AS description
                        FROM icd_codes
                        WHERE code ILIKE ? OR COALESCE(description, '') ILIKE ?
                        ORDER BY CASE WHEN code ILIKE ? THEN 0
                                      WHEN code ILIKE ? THEN 1
                                      ELSE 2 END,
                                 code
                        LIMIT ?
                        """,
                (rs, i) -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("code", rs.getString("code"));
                    m.put("system", rs.getString("system"));
                    m.put("description", rs.getString("description"));
                    return m;
                },
                like, like, query, prefix, cap);
    }
}
