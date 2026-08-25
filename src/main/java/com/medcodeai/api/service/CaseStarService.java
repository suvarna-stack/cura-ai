package com.medcodeai.api.service;

import com.medcodeai.api.repo.CaseStarsRepository;
import com.medcodeai.api.repo.CasesRepository;
import com.medcodeai.api.repo.UsersRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Case stars — "look at this one first", visible to every coder.
 *
 * A star is a property of the CASE, not of the coder who clicked it: there is
 * one star per case and everyone sees the same one, because the feature exists
 * so a fellow coder can tell which case is more important. A per-user
 * favourites list would look identical on screen and communicate nothing.
 *
 * Deliberately NOT gated by the working lock (CaseLockService) and not run
 * through WriteGate: flagging a case as important is an annotation, not a
 * change to its codes, and the coder most likely to want to flag a case is the
 * one who cannot open it because a colleague is already inside. Nothing here
 * reaches the hospital.
 *
 * Persisted (unlike locks) — a star that vanished on restart would be worse
 * than no star at all.
 */
@Service
public class CaseStarService {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final CaseStarsRepository stars;
    private final CasesRepository cases;
    private final UsersRepository users;
    private final CasesCache cache;

    public CaseStarService(CaseStarsRepository stars, CasesRepository cases,
                           UsersRepository users, CasesCache cache) {
        this.stars = stars;
        this.cases = cases;
        this.users = users;
        this.cache = cache;
    }

    /** True when the case exists at all — the controller 404s on false. */
    public boolean caseExists(String caseId) {
        return cases.caseExists(caseId);
    }

    /** Star the case for everyone; returns the resulting state. */
    public Map<String, Object> star(String caseId, String stamp) {
        stars.set(caseId, stamp, LocalDateTime.now().format(TS));
        cache.invalidate(); // the dashboard payload carries `starred`
        return state(caseId);
    }

    /** Clear the case's star; returns the resulting state. */
    public Map<String, Object> unstar(String caseId) {
        stars.clear(caseId);
        cache.invalidate();
        return state(caseId);
    }

    /** {ok, starred, starredBy, starredAt} — the response both endpoints return. */
    public Map<String, Object> state(String caseId) {
        String[] s = stars.star(caseId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("starred", s != null);
        out.put("starredBy", s == null ? null : displayName(s[0]));
        out.put("starredAt", s == null ? null : s[1]);
        return out;
    }

    /** Resolve an audit stamp to users.full_name, like the case payload does. */
    private String displayName(String stamp) {
        String mapped = users.displayNameByStamp().get(stamp);
        return mapped != null ? mapped : stamp;
    }
}
