package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The `case_stars` table (V8): one row per starred case, shared by every
 * coder. Kept out of {@link CasesRepository} on purpose — that class is the
 * read-side port of sync/views.py, and this is a small read+write pair that
 * belongs to nothing there.
 */
@Repository
public class CaseStarsRepository {

    private final JdbcTemplate jdbc;

    public CaseStarsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** case_id -> {by, at}, for the dashboard payload (one query, all cases). */
    public Map<String, String[]> allStars() {
        Map<String, String[]> out = new HashMap<>();
        for (Map<String, Object> r : jdbc.query(
                "SELECT case_id, starred_by, starred_at FROM case_stars", CasesRepository.ROW)) {
            out.put((String) r.get("case_id"),
                    new String[]{(String) r.get("starred_by"), (String) r.get("starred_at")});
        }
        return out;
    }

    /** {by, at} for one case, or null when it is not starred. */
    public String[] star(String caseId) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT starred_by, starred_at FROM case_stars WHERE case_id=?",
                CasesRepository.ROW, caseId);
        return rows.isEmpty() ? null
                : new String[]{(String) rows.get(0).get("starred_by"),
                               (String) rows.get(0).get("starred_at")};
    }

    /**
     * Star the case. Re-starting an already-starred case moves it to the new
     * coder and time — a star is the case's current "look at this", not a log,
     * and the audit trail is coding_history's job.
     */
    public void set(String caseId, String by, String at) {
        jdbc.update("""
                INSERT INTO case_stars (case_id, starred_by, starred_at) VALUES (?,?,?)
                ON CONFLICT (case_id) DO UPDATE SET starred_by=EXCLUDED.starred_by,
                                                    starred_at=EXCLUDED.starred_at""",
                caseId, by, at);
    }

    /** Unstar. Any coder may clear any star — same posture as reopen. */
    public void clear(String caseId) {
        jdbc.update("DELETE FROM case_stars WHERE case_id=?", caseId);
    }
}
