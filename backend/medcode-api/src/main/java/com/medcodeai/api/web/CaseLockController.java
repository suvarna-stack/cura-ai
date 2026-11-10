package com.medcodeai.api.web;

import com.medcodeai.api.service.AuthService;
import com.medcodeai.api.service.CaseLockService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Case working locks — one coder per case at a time. The detail page acquires
 * on open, heartbeats every 30s (the same POST renews), and releases on
 * leave; anyone else acquiring meanwhile gets {@code acquired: false} plus
 * who holds it. Deliberately always 200: "someone else has it" is a normal
 * outcome the UI renders, not an error.
 *
 * Lives under /api/cases/** so the existing auth gate covers it; the holder's
 * identity comes from the token, never from the body.
 */
@RestController
@Tag(name = "cases (locks)", description = "One coder per case: open-lease locks")
@SecurityRequirement(name = "bearerAuth")
public class CaseLockController {

    private final CaseLockService locks;

    public CaseLockController(CaseLockService locks) {
        this.locks = locks;
    }

    @PostMapping("/api/cases/{caseId}/lock")
    @Operation(summary = "Acquire or renew the working lock on a case",
            description = "Called when a coder opens the case detail page and every 30s while "
                    + "it stays open. Returns `{acquired, holder: {name, email}, since, "
                    + "ttlSeconds}` — `acquired: false` means another coder holds the case "
                    + "and the UI shows who instead of the editor. A lease not renewed for "
                    + "`ttlSeconds` expires on its own, so a closed laptop never strands a "
                    + "case. Re-acquiring your own case (second tab) succeeds.")
    public Map<String, Object> acquire(HttpServletRequest request, @PathVariable String caseId) {
        AuthService.Principal p = principal(request);
        CaseLockService.Lock holder = locks.acquire(caseId, p.email(), displayName(p));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("acquired", holder.email().equals(p.email()));
        out.put("holder", Map.of("name", holder.name(), "email", holder.email()));
        out.put("since", holder.acquiredAt().toString());
        out.put("ttlSeconds", CaseLockService.TTL.toSeconds());
        return out;
    }

    @DeleteMapping("/api/cases/{caseId}/lock")
    @Operation(summary = "Release the working lock on a case",
            description = "Called when the coder leaves the detail page. Only the holder's own "
                    + "lock is released — a stale release from a tab that already lost the "
                    + "lease is a harmless no-op. Always `{ok: true}`.")
    public Map<String, Object> release(HttpServletRequest request, @PathVariable String caseId) {
        locks.release(caseId, principal(request).email());
        return Map.of("ok", true);
    }

    private AuthService.Principal principal(HttpServletRequest request) {
        return (AuthService.Principal) request.getAttribute(AuthInterceptor.PRINCIPAL);
    }

    private String displayName(AuthService.Principal p) {
        String name = p.fullName();
        return (name == null || name.isBlank()) ? p.email() : name;
    }
}
