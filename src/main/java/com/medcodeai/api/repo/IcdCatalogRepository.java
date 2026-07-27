package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Catalog-style access to icd_codes for the knowledge sync (bulk upsert of
 * code + official-title pairs extracted from uploaded reference documents).
 * Kept separate from CodingRepository, whose icd_codes methods serve the
 * per-case approval workflow.
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
        jdbc.query("SELECT code, code_system::text AS code_system, description FROM icd_codes",
                rs -> {
                    String d = rs.getString("description");
                    out.put(rs.getString("code") + "|" + rs.getString("code_system"),
                            d == null ? "" : d);
                });
        return out;
    }

    /** Bulk-insert new catalog rows: [code, system, description]. */
    public void insertCodes(List<Object[]> rows) {
        jdbc.batchUpdate(
                "INSERT INTO icd_codes (code, code_system, description) VALUES (?,?,?) "
                        + "ON CONFLICT (code, code_system) DO NOTHING",
                rows);
    }

    /** Fill descriptions that are currently null/blank: [description, code, system]. */
    public void fillDescriptions(List<Object[]> rows) {
        jdbc.batchUpdate(
                "UPDATE icd_codes SET description = ? WHERE code = ? AND code_system = ? "
                        + "AND (description IS NULL OR description = '')",
                rows);
    }
}
