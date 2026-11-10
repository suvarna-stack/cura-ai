package com.medcodeai.api.web;

import com.medcodeai.api.repo.CasesRepository;
import com.medcodeai.api.repo.WorkingStateRepository;
import com.medcodeai.api.service.ApprovalService;
import com.medcodeai.api.service.AuthService;
import com.medcodeai.api.service.CaseLockService;
import com.medcodeai.api.service.CaseSuggestService;
import com.medcodeai.api.service.WriteGate;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Write endpoints. Request bodies arrive as raw bytes and are parsed manually
 * so malformed JSON degrades to null exactly like Flask's
 * request.get_json(silent=True) — producing Flask's own 400 bodies, never
 * Spring's default error page.
 *
 * That byte[] parameter is why every method carries an explicit Swagger
 * @RequestBody: without it the try-it-out box renders as binary upload.
 */
@RestController
@Tag(name = "cases (write)", description = "Working-state saves, approve/reopen, demo reset")
@SecurityRequirement(name = "bearerAuth") // Phase 3: the whole case surface needs a login token
public class CasesWriteController {

    private static final String OK_EXAMPLE = "{\"ok\": true}";
    private static final String NOT_FOUND_EXAMPLE = "{\"error\": \"not found\"}";

    private final CasesRepository cases;
    private final WorkingStateRepository workingState;
    private final WriteGate writeGate;
    private final ApprovalService approvals;
    private final CaseSuggestService suggest;
    private final CaseLockService caseLocks;
    private final JsonMapper json = new JsonMapper();
    // POST /api/demo/reset is a public bulk write; DEMO_TOOLS_ENABLED gates it
    // (default on locally, forced off in the Docker image — same posture as
    // SWAGGER_ENABLED). When off, the endpoint behaves as if it doesn't exist.
    private final boolean demoToolsEnabled =
            !"false".equalsIgnoreCase(System.getenv().getOrDefault("DEMO_TOOLS_ENABLED", "true").strip());

    private final com.medcodeai.api.service.DemoBaselineService demoBaseline;

    public CasesWriteController(CasesRepository cases, WorkingStateRepository workingState,
                                WriteGate writeGate, ApprovalService approvals,
                                CaseSuggestService suggest, CaseLockService caseLocks,
                                com.medcodeai.api.service.DemoBaselineService demoBaseline) {
        this.cases = cases;
        this.workingState = workingState;
        this.writeGate = writeGate;
        this.approvals = approvals;
        this.suggest = suggest;
        this.caseLocks = caseLocks;
        this.demoBaseline = demoBaseline;
    }

    /** One coder per case: refuse the write when another coder holds it.
     *  The UI's lock screen makes this near-unreachable; it exists so a
     *  stale tab or a scripted client can't overwrite live work. */
    private void requireUnlocked(String caseId, AuthService.Principal p) {
        CaseLockService.Lock holder = caseLocks.heldByOther(caseId, p.email());
        if (holder != null) {
            throw new ApiExceptionHandler.ConflictException(
                    "case " + caseId + " is being worked on by " + holder.name());
        }
    }

    // app.py:299 approve() — {ids} -> finalize + iMed write-back. The coder
    // identity comes from the login token (Phase 3); a body `coder` field is
    // accepted for backward compatibility but IGNORED.
    @PostMapping("/api/cases/approve")
    @Operation(summary = "Approve cases",
            description = "For each existing case: the saved `codeEdits` become real "
                    + "coder-assigned codes (no edits → the imported principal diagnosis is "
                    + "re-confirmed), the case is finalized, and the results are sent to the "
                    + "hospital's iMed API. The approving coder is **the logged-in account** "
                    + "(a body `coder` field is ignored).\n\n"
                    + "Our DB commits first, then the hospital calls run — a `500` means our "
                    + "side committed but the hospital call failed. Approve is idempotent: "
                    + "**re-run it to heal.**")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = """
                    {
                      "ok": true,
                      "approved": ["690003026"],
                      "notFound": [],
                      "stats": {
                        "cases_finalized": 1,
                        "status_rows": 1,
                        "coder_codes_created": 1,
                        "mcai_code_rows": 1
                      }
                    }
                    """)))
    @ApiResponse(responseCode = "400", description = "`ids` missing, empty, or not all strings",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(
                            value = "{\"error\": \"expected {\\\"ids\\\": [\\\"<case_id>\\\", ...]}\"}")))
    public Map<String, Object> approve(HttpServletRequest request,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(type = "object"),
                            examples = @ExampleObject(
                                    value = "{\"ids\": [\"690003026\"]}")))
            @RequestBody(required = false) byte[] body) {
        Object parsed = parseSilent(body);
        Map<?, ?> b = parsed instanceof Map<?, ?> m ? m : Map.of();
        Object ids = b.get("ids");
        if (!(ids instanceof List<?> idList) || idList.isEmpty()
                || !idList.stream().allMatch(i -> i instanceof String)) {
            throw new ApiExceptionHandler.BadRequestException("expected {\"ids\": [\"<case_id>\", ...]}");
        }
        AuthService.Principal p = principal(request);
        @SuppressWarnings("unchecked")
        List<String> caseIds = (List<String>) idList;
        for (String id : caseIds) {
            requireUnlocked(id, p);
        }
        return approvals.approve(caseIds, p.userId(), p.email());
    }

    // app.py:360 reopen() — undo approve (both schemas). Actor = the logged-in
    // account; a body `coder` field is accepted but IGNORED (Phase 3).
    @PostMapping("/api/cases/{caseId}/reopen")
    @Operation(summary = "Reopen an approved case",
            description = "Reverses an approve on both sides (ours and the hospital's); the "
                    + "coder's saved edits and draft are KEPT. The reopening actor is **the "
                    + "logged-in account** (a body `coder` field is ignored). "
                    + "Same commit-then-call ordering as approve — idempotent, so retry a `500`.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = OK_EXAMPLE)))
    @ApiResponse(responseCode = "404", description = "Unknown case",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = NOT_FOUND_EXAMPLE)))
    public Map<String, Object> reopen(HttpServletRequest request, @PathVariable String caseId,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(type = "object"),
                            examples = @ExampleObject(value = "{}")))
            @RequestBody(required = false) byte[] body) {
        AuthService.Principal p = principal(request);
        requireUnlocked(caseId, p);
        return approvals.reopen(caseId, p.email());
    }

    // Settings demo tools: freeze the demo-start state of BOTH databases
    @PostMapping("/api/demo/snapshot")
    @Operation(summary = "Freeze the current state of both databases as the demo baseline",
            description = "Copies every medcode table into the `demo_baseline` schema and tells "
                    + "imed-mock-api to snapshot the hospital DB the same way (`imed_baseline`). "
                    + "Run once when both sides look exactly how the demo should start; "
                    + "`POST /api/demo/reset` then restores this state on demand.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = "{\"ok\": true, \"medcodeTables\": {\"users\": 4},"
                    + " \"imedTables\": {\"medhack_patient\": 21}}")))
    @ApiResponse(responseCode = "404", description = "Disabled (DEMO_TOOLS_ENABLED=false)",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = NOT_FOUND_EXAMPLE)))
    public Map<String, Object> demoSnapshot() {
        if (!demoToolsEnabled) {
            throw new ApiExceptionHandler.NotFoundException(); // disabled in this environment
        }
        return demoBaseline.snapshot();
    }

    // Settings demo tools bulk reset — restore the snapshotted demo baseline
    @PostMapping("/api/demo/reset")
    @Operation(summary = "Restore both databases to the demo baseline",
            description = "Truncates + refills every baselined medcode table from the "
                    + "`demo_baseline` schema (accounts created after the snapshot are removed, "
                    + "the operator's session survives), re-aligns sequences, then tells "
                    + "imed-mock-api to restore the hospital DB (undoing all write-backs). "
                    + "**Bulk write — it discards everything done since the snapshot.**")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = "{\"ok\": true, \"medcodeTables\": {\"cases\": 0},"
                    + " \"imedTables\": {\"medhack_patient\": 21}}")))
    @ApiResponse(responseCode = "404", description = "Disabled (DEMO_TOOLS_ENABLED=false)",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = NOT_FOUND_EXAMPLE)))
    public Map<String, Object> demoReset(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(type = "object"),
                            examples = @ExampleObject(value = "{}")))
            @RequestBody(required = false) byte[] body) {
        if (!demoToolsEnabled) {
            throw new ApiExceptionHandler.NotFoundException(); // disabled in this environment
        }
        return demoBaseline.reset();
    }

    // app.py:255 put_codes() — body is a bare StoredCode[] array
    @PutMapping("/api/cases/{caseId}/codes")
    @Operation(summary = "Save the coder's working code list",
            description = "The body is a **bare JSON array**, stored verbatim and echoed back as "
                    + "`codeEdits` on the detail endpoint. Fields the backend interprets at "
                    + "approve time: `code` (skipped if empty or `???`), `type` (labels matching "
                    + "`icd-9`/`pcs` → ICD-9 procedure, anything else → ICD-10), `missing` "
                    + "(truthy → row skipped), `selected` (the coder's tick — explicit "
                    + "`false` → row skipped, absent → approved), and on ICD-9 rows "
                    + "`operation_start`/`operation_end` (the procedure's time window, sent to iMed). "
                    + "Extra fields are stored and echoed, never interpreted.\n\n"
                    + "Working state never invalidates the dashboard cache and survives reopen.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = OK_EXAMPLE)))
    @ApiResponse(responseCode = "400", description = "Body is not a JSON array",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"expected a JSON array of codes\"}")))
    @ApiResponse(responseCode = "404", description = "Unknown case",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = NOT_FOUND_EXAMPLE)))
    public Map<String, Object> putCodes(HttpServletRequest request, @PathVariable String caseId,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(type = "array"),
                            examples = @ExampleObject(value = """
                                    [
                                      {"code": "E11.9", "type": "ICD-10", "desc": "Type 2 diabetes", "missing": false}
                                    ]
                                    """)))
            @RequestBody(required = false) byte[] body) {
        requireUnlocked(caseId, principal(request));
        Object payload = parseSilent(body);
        if (!(payload instanceof List)) {
            throw new ApiExceptionHandler.BadRequestException("expected a JSON array of codes");
        }
        writeGate.locked(() -> {
            if (!cases.caseExists(caseId)) {
                throw new ApiExceptionHandler.NotFoundException();
            }
            workingState.upsertEdits(caseId, json.writeValueAsString(payload), nowStr());
            return null;
        });
        // no cache invalidation: edits are working state, cases.json doesn't show them
        return ok();
    }

    // PUT /api/cases/{caseId}/draft was REMOVED 2026-08-02: the report is the
    // hospital's clinical record and is read-only in the app (the Edit Report
    // feature died 15 Jul 2026; no client has called this since).

    @PostMapping("/api/cases/{caseId}/suggest-codes")
    @Operation(summary = "Suggest ICD-9 / ICD-10 codes via RAG",
            description = "Builds a clinical narrative from the case's report sections and asks "
                    + "the RAG knowledge index for ICD-10 diagnosis and ICD-9 procedure "
                    + "suggestions. Does not write anything — the coder accepts or edits "
                    + "suggestions in the UI, then saves via PUT /codes.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value =
                    "{\"caseId\":\"870…\",\"codes\":[{\"code\":\"S82.6\",\"system\":\"ICD-10\","
                            + "\"description\":\"Fracture of lateral malleolus\",\"confidence\":88,"
                            + "\"source\":\"icd10_vol1\"}],\"mode\":\"plain\",\"hitsUsed\":8}")))
    @ApiResponse(responseCode = "404", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = NOT_FOUND_EXAMPLE)))
    public Map<String, Object> suggestCodes(@PathVariable String caseId) {
        Map<String, Object> out = suggest.suggestForCase(caseId);
        if (out == null) {
            throw new ApiExceptionHandler.NotFoundException();
        }
        return out;
    }

    /** The authenticated caller, stashed by AuthInterceptor (guarded route). */
    private static AuthService.Principal principal(HttpServletRequest request) {
        Object p = request.getAttribute(AuthInterceptor.PRINCIPAL);
        if (!(p instanceof AuthService.Principal principal)) {
            // unreachable behind the interceptor; loud beats a silent fake actor
            throw new ApiExceptionHandler.UnauthorizedException("unauthorized");
        }
        return principal;
    }

    private Object parseSilent(byte[] body) {
        if (body == null || body.length == 0) {
            return null;
        }
        try {
            return json.readValue(new String(body, StandardCharsets.UTF_8), Object.class);
        } catch (RuntimeException e) {
            return null;
        }
    }

    // app.py:118 now_str()
    static String nowStr() {
        return ApprovalService.nowStr();
    }

    static Map<String, Object> ok() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", true);
        return m;
    }
}
