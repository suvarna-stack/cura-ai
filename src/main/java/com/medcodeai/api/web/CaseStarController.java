package com.medcodeai.api.web;

import com.medcodeai.api.service.AuthService;
import com.medcodeai.api.service.CaseStarService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Case stars — one shared "important" flag per case, so a coder can tell a
 * fellow coder which case to look at first. Star and unstar are the same two
 * verbs the lock uses (POST to set, DELETE to clear) and live under
 * /api/cases/** so the existing auth gate covers them; the starring coder
 * comes from the token, never from the body.
 *
 * Unlike the write endpoints these are NOT refused while another coder holds
 * the case: a star is an annotation about the case, not an edit of it (see
 * CaseStarService).
 */
@RestController
@Tag(name = "cases (stars)", description = "Shared \"important\" flag on a case")
@SecurityRequirement(name = "bearerAuth")
public class CaseStarController {

    private static final String STATE_EXAMPLE = """
            {"ok": true, "starred": true, "starredBy": "Austin", "starredAt": "2026-08-25 10:11:12"}""";

    private final CaseStarService stars;

    public CaseStarController(CaseStarService stars) {
        this.stars = stars;
    }

    @PostMapping("/api/cases/{caseId}/star")
    @Operation(summary = "Star a case as important",
            description = "Marks the case important for **everyone** — one star per case, not "
                    + "a private favourites list. No body; the starring coder is the "
                    + "logged-in account. Starring an already-starred case moves the star to "
                    + "the new coder and time (idempotent in effect). Returns `{ok, starred, "
                    + "starredBy, starredAt}`, where `starredBy` is the display name. Allowed "
                    + "even while another coder holds the case's working lock.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = STATE_EXAMPLE)))
    @ApiResponse(responseCode = "404", description = "Unknown case",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"not found\"}")))
    public Map<String, Object> star(HttpServletRequest request, @PathVariable String caseId) {
        requireCase(caseId);
        return stars.star(caseId, principal(request).email());
    }

    @DeleteMapping("/api/cases/{caseId}/star")
    @Operation(summary = "Clear a case's star",
            description = "Removes the star whoever set it — any coder may clear any star, "
                    + "the same posture reopen takes. Clearing an unstarred case is a no-op. "
                    + "Returns the resulting state (`starred: false`, the other two `null`).")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value =
                    "{\"ok\": true, \"starred\": false, \"starredBy\": null, \"starredAt\": null}")))
    @ApiResponse(responseCode = "404", description = "Unknown case",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"not found\"}")))
    public Map<String, Object> unstar(@PathVariable String caseId) {
        requireCase(caseId);
        return stars.unstar(caseId);
    }

    private void requireCase(String caseId) {
        if (!stars.caseExists(caseId)) {
            throw new ApiExceptionHandler.NotFoundException();
        }
    }

    private AuthService.Principal principal(HttpServletRequest request) {
        return (AuthService.Principal) request.getAttribute(AuthInterceptor.PRINCIPAL);
    }
}
