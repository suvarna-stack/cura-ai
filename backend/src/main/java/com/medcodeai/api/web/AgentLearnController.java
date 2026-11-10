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
 * A taught rule belongs to the coder who taught it. Everyone reads the whole
 * list — a shared knowledge layer is the point — but editing, muting and
 * deleting are the author's alone, so one coder cannot quietly rewrite or
 * silence another's rule. An admin may act on any rule: a wrong rule taught
 * by a coder who has since left the hospital still has to be removable. That
 * check lives here rather than in RAG because this is the only tier holding
 * a token; RAG just records `created_by_id` and hands it back.
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
    /** Unreachable behind the interceptor; a stranger owns nothing and is no admin. */
    private static final AuthService.Principal ANONYMOUS =
            new AuthService.Principal(0, "", "coder", "coder", "");

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
        AuthService.Principal me = principal(request);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", text(body));
        payload.put("created_by", displayName(me));
        payload.put("created_by_id", me.userId());
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
                    + "rule in place, which only its author (or an admin) may do — anyone else "
                    + "gets 403. The author is taken from the token and never changes on an edit.")
    public Map<String, Object> save(HttpServletRequest request,
                                    @RequestBody(required = false) Map<String, Object> body) {
        Object note = body == null ? null : body.get("note");
        if (!(note instanceof Map<?, ?> map) || map.isEmpty()) {
            throw new ApiExceptionHandler.BadRequestException("note is required");
        }
        AuthService.Principal me = principal(request);
        // An id in the body means "edit that rule in place" — the same act as
        // deleting it and teaching a new one, so it needs the same permission.
        // Fail closed: an id that is present must be a string, and RAG gets
        // exactly the id that was checked (a copy of the note carries it).
        Map<String, Object> forwarded = new LinkedHashMap<>();
        map.forEach((k, v) -> forwarded.put(String.valueOf(k), v));
        Object rawId = forwarded.get("id");
        if (rawId != null && !(rawId instanceof String)) {
            throw new ApiExceptionHandler.BadRequestException("note.id must be a string");
        }
        String editing = rawId == null ? "" : ((String) rawId).strip();
        if (editing.isEmpty()) {
            forwarded.remove("id");          // blank = a new rule
        } else {
            requireAuthor(me, editing);
            forwarded.put("id", editing);
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("note", forwarded);
        payload.put("created_by", displayName(me));
        payload.put("created_by_id", me.userId());
        return forward(() -> rag.saveNote(payload));
    }

    @PatchMapping("/api/agent/learn/notes/{noteId}")
    @Operation(summary = "Mute / un-mute a taught rule",
            description = "`?active=false` stops the rule influencing answers (its chunk leaves "
                    + "the index) while keeping it in the list; `?active=true` puts it back. "
                    + "Author (or admin) only — 403 for anyone else.")
    public Map<String, Object> toggle(HttpServletRequest request,
                                      @PathVariable String noteId,
                                      @RequestParam(defaultValue = "true") boolean active) {
        requireAuthor(principal(request), noteId);
        return forward(() -> rag.toggleNote(noteId, active));
    }

    @DeleteMapping("/api/agent/learn/notes/{noteId}")
    @Operation(summary = "Forget a taught rule",
            description = "Removes the note and its indexed chunk. `{deleted: 0|1}`. "
                    + "Author (or admin) only — 403 for anyone else.")
    public Map<String, Object> delete(HttpServletRequest request,
                                      @PathVariable String noteId) {
        requireAuthor(principal(request), noteId);
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

    /** Who is calling — from the token, so a rule can never be misattributed. */
    private AuthService.Principal principal(HttpServletRequest request) {
        Object p = request.getAttribute(AuthInterceptor.PRINCIPAL);
        return p instanceof AuthService.Principal principal ? principal : ANONYMOUS;
    }

    /** How a coder is credited on a rule they teach. */
    private static String displayName(AuthService.Principal me) {
        String name = me.fullName();
        return (name == null || name.isBlank()) ? me.email() : name;
    }

    /**
     * Refuse to change someone else's rule. An unknown id passes through so
     * RAG still answers it (404 on mute, `{deleted: 0}` on delete) rather than
     * this turning into a probe for which rule ids exist.
     */
    private void requireAuthor(AuthService.Principal me, String noteId) {
        if (isAdmin(me)) {
            return;                          // no lookup needed
        }
        Map<String, Object> note = forward(() -> rag.note(noteId));
        if (note == null || mayManage(note, me)) {
            return;
        }
        Object owner = note.get("created_by");
        String who = owner instanceof String s && !s.isBlank() ? s : "another coder";
        throw new ApiExceptionHandler.ForbiddenException(
                "This rule was taught by " + who
                        + ". Only its author can change or delete it.");
    }

    private static boolean isAdmin(AuthService.Principal me) {
        return "admin".equals(me.role());
    }

    /**
     * May this coder change that rule? Ownership hangs on `created_by_id`, the
     * user id RAG stored when the rule was taught — stable across a rename and
     * unambiguous when two coders share a display name.
     *
     * Rules taught before that field existed carry only the credited name, so
     * those fall back to matching it against the caller's own name or email;
     * one with neither belongs to nobody and stays open. Package-private so
     * the fallbacks are unit-testable without a running RAG.
     */
    static boolean mayManage(Map<String, Object> note, AuthService.Principal me) {
        if (isAdmin(me)) {
            return true;
        }
        if (note.get("created_by_id") instanceof Number ownerId) {
            return ownerId.intValue() == me.userId();
        }
        String owner = note.get("created_by") instanceof String s ? s.strip() : "";
        return owner.isEmpty()
                || owner.equalsIgnoreCase(displayName(me))
                || owner.equalsIgnoreCase(me.email());
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
