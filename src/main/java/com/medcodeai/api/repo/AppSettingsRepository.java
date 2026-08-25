package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The global key/value settings bag (V9). Small enough to read whole on every
 * request that needs one key — it holds a handful of rows and is read on the
 * cases payload, so a cache here would buy nothing and could go stale against
 * an admin's toggle.
 */
@Repository
public class AppSettingsRepository {

    private final JdbcTemplate jdbc;

    public AppSettingsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Every setting, key → raw text value. */
    public Map<String, String> all() {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map<String, Object> r : jdbc.queryForList("SELECT key, value FROM app_settings")) {
            out.put((String) r.get("key"), (String) r.get("value"));
        }
        return out;
    }

    /**
     * Upsert one setting, stamping who changed it and when. `by` is the raw
     * audit stamp (the account's email), matching case_stars.starred_by.
     */
    public void put(String key, String value, String by) {
        jdbc.update("""
                INSERT INTO app_settings (key, value, updated_at, updated_by)
                     VALUES (?, ?, to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), ?)
                ON CONFLICT (key) DO UPDATE
                        SET value = EXCLUDED.value,
                            updated_at = EXCLUDED.updated_at,
                            updated_by = EXCLUDED.updated_by""", key, value, by);
    }
}
