package com.medcodeai.api.web;

import com.medcodeai.api.service.SyncService;
import com.medcodeai.api.web.ApiExceptionHandler.BadRequestException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * Inbound sync: pull case data FROM the hospital's iMed API into medcode. The
 * only endpoints that read the hospital's data (all other hospital traffic is
 * the approve/reopen write-back). Non-destructive — see SyncService: new cases
 * are imported, existing open cases are refreshed, finalized cases are skipped.
 */
@RestController
@Tag(name = "sync", description = "Pull case data from the hospital iMed API (new → import, open → refresh, finalized → skip)")
@SecurityRequirement(name = "bearerAuth") // Phase 3: the whole case surface needs a login token
public class SyncController {

    private static final String SYNC_EXAMPLE = """
            {
              "ok": true,
              "imported": ["690003026"],
              "refreshed": [],
              "skippedApproved": ["690003027"],
              "failed": [],
              "stats": { "cases": 1, "sections": 8, "codes": 3, "orders": 12,
                         "chunks": 20, "coverageTypes": 1 }
            }
            """;

    private final SyncService sync;

    public SyncController(SyncService sync) {
        this.sync = sync;
    }

    /** Accepted window-bound formats; date-only widening is the hospital's job. */
    private static final Pattern DT_PARAM =
            Pattern.compile("^\\d{4}-\\d{2}-\\d{2}([ T]\\d{2}:\\d{2}(:\\d{2})?)?$");

    @PostMapping("/api/sync")
    @Operation(summary = "Sync cases from the hospital (by visit-date window, or refresh)",
            description = "With a JSON body `{\"from\": \"YYYY-MM-DD\", \"to\": \"YYYY-MM-DD\"}` "
                    + "(datetimes accepted but only the day counts, bounds inclusive, `to` "
                    + "defaults to today, `from` is required) it pulls every case whose VISIT "
                    + "date falls in the window, one hospital call per day — this is how NEW "
                    + "cases arrive. With no window it re-reads the OPEN cases medcode already "
                    + "holds, by their saved visit ids, and imports nothing new (the hospital "
                    + "has no list-every-visit route). "
                    + "Per case: **new** → full import; **open** → hospital-sourced data refreshed "
                    + "(coder edits/drafts/approvals kept); **already finalized** → skipped, left "
                    + "intact. Idempotent — safe to re-run. Reads the hospital only (no write-back). "
                    + "Runs under the single-writer lock, so it briefly blocks approve/reopen.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = SYNC_EXAMPLE)))
    @ApiResponse(responseCode = "400", description = "Malformed from/to, or to without from",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"from must be YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS]\"}")))
    public Map<String, Object> syncAll(@RequestBody(required = false) Map<String, Object> body) {
        String from = windowBound(body, "from");
        String to = windowBound(body, "to");
        if (from == null && to != null) {
            // an open start would mean one hospital call per day back to whenever
            throw new BadRequestException("from is required when to is given");
        }
        return sync.syncAll(from, to);
    }

    /** Null when absent/blank; 400 on anything that isn't a date or datetime. */
    private static String windowBound(Map<String, Object> body, String key) {
        Object raw = body == null ? null : body.get(key);
        if (raw == null || raw.toString().isBlank()) {
            return null;
        }
        String v = raw.toString().trim();
        if (!DT_PARAM.matcher(v).matches()) {
            throw new BadRequestException(key + " must be YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS]");
        }
        return v;
    }

    @PostMapping("/api/cases/{caseId}/sync")
    @Operation(summary = "Sync one case from the hospital",
            description = "Same non-destructive rules as `POST /api/sync`, scoped to one "
                    + "transaction number. `404` when the hospital doesn't expose that case.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = SYNC_EXAMPLE)))
    @ApiResponse(responseCode = "404", description = "Hospital has no such transaction number",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"not found\"}")))
    public Map<String, Object> syncOne(@PathVariable String caseId) {
        return sync.syncOne(caseId);
    }
}
