package com.medcodeai.api.web;

import com.medcodeai.api.client.RagApiClient;
import com.medcodeai.api.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Suggest & Learn — the coder teaches the agent a coding rule in plain
 * language (English or Thai) and the rule becomes part of what retrieval
 * reads, on top of the uploaded ICD-9/ICD-10 references.
 *
 * Nothing here trains model weights: a taught rule is stored as a structured
 * note, embedded as one chunk in the same index as the reference PDFs, and
 * pinned above the general guidelines when its scenario comes back. That is
 * the only version of "the AI learned it" a hospital can audit — every rule
 * is visible in a list, attributed to the coder who taught it, and can be
 * muted or deleted the moment it turns out to be wrong.
 *
 * Extraction and saving are separate calls on purpose: /extract only proposes
 * a draft, and nothing enters the knowledge layer until the coder confirms
 * what the AI understood. `created_by` is taken from the token, never from
 * the request body.
 *
 * Lives under /api/agent/** so the existing WebConfig guard covers it (any
 * valid token, either role) — the same surface as the chat it belongs to.
 */
@RestController
@Tag(name = "agent", description = "Coder AI Agent chat (RAG-grounded, EN/TH)")
@SecurityRequirement(name = "bearerAuth")
public class AgentLearnController {

    private static final int MAX_TEXT_CHARS = 2000;
    private static final int MAX_MATCH_LIMIT = 10;

    private final RagApiClient rag;
    private final JsonMapper json = new JsonMapper();

    public AgentLearnController(RagApiClient rag) {
        this.rag = rag;
    }

    @PostMapping("/api/agent/learn/classify")
    @Operation(summary = "Teaching or asking?",
            description = "`{\"text\": \"...\"}` -> `{intent: \"teach\"|\"ask\", confidence}`. "
                    + "Deterministic cue matching (no model call), used by the chat to offer "
                    + "\"looks like you're teaching me — save this?\". Advisory only: it never "
                    + "stores anything.")
    public Map<String, Object> classify(@RequestBody(required = false) Map<String, Object> body) {
        return forward(() -> rag.classifyIntent(Map.of("text", text(body))));
    }

    @PostMapping("/api/agent/learn/extract")
    @Operation(summary = "Extract a coding rule from plain language",
            description = "`{\"text\": \"...\"}` -> a draft note `{scenario, codes[{code, system, "
                    + "description, role}], rule, reason, ...}` where role is principal | secondary "
                    + "| exclude. Nothing is stored — the coder confirms the draft first. Codes the "
                    + "model invents are dropped: only codes present in the coder's own text survive.")
    public Map<String, Object> extract(HttpServletRequest request,
                                       @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", text(body));
        payload.put("created_by", actor(request));
        return forward(() -> rag.extractNote(payload));
    }

    @GetMapping("/api/agent/learn/notes")
    @Operation(summary = "List taught rules",
            description = "`{notes: [...]}` newest first, including muted ones (`active: false`). "
                    + "`hits` counts how often a rule has actually fired in an answer.")
    public Map<String, Object> notes() {
        return forward(rag::notes);
    }

    @PostMapping("/api/agent/learn/notes")
    @Operation(summary = "Save a confirmed rule",
            description = "`{\"note\": {...}}` — the draft as the coder confirmed or edited it. "
                    + "The note is stored and embedded into the knowledge index, so it starts "
                    + "influencing answers immediately. Passing an existing `note.id` edits that "
                    + "rule in place. The author is taken from the token.")
    public Map<String, Object> save(HttpServletRequest request,
                                    @RequestBody(required = false) Map<String, Object> body) {
        Object note = body == null ? null : body.get("note");
        if (!(note instanceof Map<?, ?> map) || map.isEmpty()) {
            throw new ApiExceptionHandler.BadRequestException("note is required");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("note", map);
        payload.put("created_by", actor(request));
        return forward(() -> rag.saveNote(payload));
    }

    @PatchMapping("/api/agent/learn/notes/{noteId}")
    @Operation(summary = "Mute / un-mute a taught rule",
            description = "`?active=false` stops the rule influencing answers (its chunk leaves "
                    + "the index) while keeping it in the list; `?active=true` puts it back.")
    public Map<String, Object> toggle(@PathVariable String noteId,
                                      @RequestParam(defaultValue = "true") boolean active) {
        return forward(() -> rag.toggleNote(noteId, active));
    }

    @DeleteMapping("/api/agent/learn/notes/{noteId}")
    @Operation(summary = "Forget a taught rule",
            description = "Removes the note and its indexed chunk. `{deleted: 0|1}`.")
    public Map<String, Object> delete(@PathVariable String noteId) {
        return forward(() -> rag.deleteNote(noteId));
    }

    @PostMapping("/api/agent/learn/match")
    @Operation(summary = "Which taught rules apply to this text?",
            description = "`{\"text\": \"...\", \"limit\": 3}` -> `{notes: [{id, summary, rule, "
                    + "codes, created_by, via}]}`. This is what the case page calls to show "
                    + "\"Learned note applies\" above the AI suggestions.")
    public Map<String, Object> match(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", text(body));
        if (body != null && body.get("limit") instanceof Number n) {
            payload.put("limit", Math.max(1, Math.min(MAX_MATCH_LIMIT, n.intValue())));
        }
        return forward(() -> rag.matchNotes(payload));
    }

    // ---------------------------------------------------------------------

    private String text(Map<String, Object> body) {
        Object raw = body == null ? null : body.get("text");
        if (!(raw instanceof String s) || s.isBlank()) {
            throw new ApiExceptionHandler.BadRequestException("text is required");
        }
        return s.length() > MAX_TEXT_CHARS ? s.substring(0, MAX_TEXT_CHARS) : s;
    }

    /** Who taught this rule — from the token, so a note can never be misattributed. */
    private String actor(HttpServletRequest request) {
        Object p = request.getAttribute(AuthInterceptor.PRINCIPAL);
        if (p instanceof AuthService.Principal principal) {
            String name = principal.fullName();
            return (name == null || name.isBlank()) ? principal.email() : name;
        }
        return "coder";                      // unreachable behind the interceptor
    }

    /** Run a RAG call, translating FastAPI 4xx {"detail": ...} into our 400 shape. */
    private <T> T forward(java.util.function.Supplier<T> call) {
        try {
            return call.get();
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().is4xxClientError()) {
                throw new ApiExceptionHandler.BadRequestException(detail(e));
            }
            throw e;
        }
    }

    private String detail(RestClientResponseException e) {
        try {
            Object v = json.readValue(
                    e.getResponseBodyAsString(StandardCharsets.UTF_8), Object.class);
            if (v instanceof Map<?, ?> m && m.get("detail") instanceof String d && !d.isBlank()) {
                return d;
            }
        } catch (RuntimeException ignored) {
            // fall through to the generic message
        }
        return "the learning service rejected that request";
    }
}
