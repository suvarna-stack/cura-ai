package com.medcodeai.api.service;

import com.medcodeai.api.repo.CaseStarsRepository;
import com.medcodeai.api.repo.CasesRepository;
import com.medcodeai.api.repo.UsersRepository;
import com.medcodeai.api.web.ApiExceptionHandler;
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
 *
 * OWNERSHIP (hospital request 2026-08-25): the star is visible to everyone but
 * belongs to whoever left it — only that coder may take it down. It is a
 * message ("look at this one first"), and a message the reader can delete is
 * not one the writer can rely on. Both writes enforce it: unstar refuses a
 * star someone else set, and so does star, which would otherwise hand
 * ownership over and let the same coder clear it on the next click.
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

    /** Star the case for everyone; returns the resulting state. Re-starting a
     *  case the caller already starred just refreshes the time. */
    public Map<String, Object> star(String caseId, String stamp) {
        requireOwn(caseId, stamp);
        stars.set(caseId, stamp, LocalDateTime.now().format(TS));
        cache.invalidate(); // the dashboard payload carries `starred`
        return state(caseId);
    }

    /** Clear the case's star; returns the resulting state. Only the coder who
     *  set it may; clearing an unstarred case stays a no-op. */
    public Map<String, Object> unstar(String caseId, String stamp) {
        requireOwn(caseId, stamp);
        stars.clear(caseId);
        cache.invalidate();
        return state(caseId);
    }

    /** 403 unless the case is unstarred or the star is the caller's own. */
    private void requireOwn(String caseId, String stamp) {
        String[] s = stars.star(caseId);
        if (mayManage(s == null ? null : s[0], stamp)) {
            return;
        }
        throw new ApiExceptionHandler.ForbiddenException(
                "starred by " + displayName(s[0]) + " — only they can remove it");
    }

    /**
     * May {@code caller} set or clear a star currently owned by {@code owner}?
     *
     * Pure, so the rule can be read and tested without a database. Compared on
     * the audit stamp (the account's email), never on the display name: two
     * coders can share a name, and one of them renaming themselves must not
     * cost them their stars — the same reasoning AgentLearnController.mayManage
     * spells out for taught rules.
     *
     * A star nobody owns (unstarred, or a row written before stamps) is free
     * for anyone to take: refusing there would strand it forever.
     */
    static boolean mayManage(String owner, String caller) {
        return owner == null || owner.isBlank() || owner.equalsIgnoreCase(caller);
    }

    /** {ok, starred, starredBy, starredAt} — the response both endpoints return. */
    public Map<String, Object> state(String caseId) {
        String[] s = stars.star(caseId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("starred", s != null);
        out.put("starredBy", s == null ? null : displayName(s[0]));
        // the raw audit stamp (the account's email) as well as the display
        // name: the frontend decides whether to offer "remove", and it can
        // only do that against an identity that is actually unique
        out.put("starredByStamp", s == null ? null : s[0]);
        out.put("starredAt", s == null ? null : s[1]);
        return out;
    }

    /** Resolve an audit stamp to users.full_name, like the case payload does. */
    private String displayName(String stamp) {
        String mapped = users.displayNameByStamp().get(stamp);
        return mapped != null ? mapped : stamp;
    }
}
