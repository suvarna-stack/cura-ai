package com.medcodeai.api.web;

import com.medcodeai.api.repo.AgentChatRepository;
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
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Server-side history for the coder AI Agent chat (2026-08-20). The chat
 * itself stays a stateless RAG proxy (AgentController); this surface is the
 * persistence layer behind the Agent page's history sidebar: list / reopen /
 * append / rename / delete conversations, always scoped to the authenticated
 * user. Lives under /api/agent/** so the existing WebConfig guard covers it
 * (any valid token, either role).
 *
 * The frontend appends a user+assistant turn pair after each successful
 * exchange; failed exchanges are deliberately never persisted.
 */
@RestController
@Tag(name = "agent", description = "Coder AI Agent chat (RAG-grounded, EN/TH)")
@SecurityRequirement(name = "bearerAuth")
public class AgentHistoryController {

    private static final DateTimeFormatter TS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int MAX_TITLE = 120;
    /** Matches AgentController.MAX_HISTORY_TURNS × 2 roles, with headroom. */
    private static final int MAX_APPEND_BATCH = 10;
    private static final int MAX_CONTENT_CHARS = 20_000;

    private final AgentChatRepository repo;
    private final JsonMapper json = new JsonMapper();

    public AgentHistoryController(AgentChatRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/api/agent/conversations")
    @Operation(summary = "List my agent conversations",
            description = "Newest-updated first: `[{id, mode, title, created_at, updated_at}]`. "
                    + "Only the calling user's own conversations.")
    public Map<String, Object> list(HttpServletRequest request) {
        return Map.of("conversations", repo.listConversations(principal(request).userId()));
    }

    @PostMapping("/api/agent/conversations")
    @Operation(summary = "Start a new agent conversation",
            description = "`{\"mode\": \"dict\"|\"learn\", \"title\": \"...\"}` — the frontend uses "
                    + "the first question (truncated) as the title. Returns the created header.")
    public Map<String, Object> create(HttpServletRequest request,
                                      @RequestBody(required = false) Map<String, Object> body) {
        int userId = principal(request).userId();
        String mode = str(body, "mode");
        if (!"dict".equals(mode) && !"learn".equals(mode)) {
            throw new ApiExceptionHandler.BadRequestException("mode must be 'dict' or 'learn'");
        }
        String title = clampTitle(str(body, "title"));
        if (title.isBlank()) {
            throw new ApiExceptionHandler.BadRequestException("title is required");
        }
        String now = now();
        int id = repo.insertConversation(userId, mode, title, now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("mode", mode);
        out.put("title", title);
        out.put("created_at", now);
        out.put("updated_at", now);
        return out;
    }

    @GetMapping("/api/agent/conversations/{id}")
    @Operation(summary = "Reopen an agent conversation",
            description = "The header plus every message in order: `{id, mode, title, messages: "
                    + "[{role, content, sources, unverified_codes, created_at}]}`. 404 if the "
                    + "conversation is missing or belongs to another user.")
    public Map<String, Object> get(HttpServletRequest request, @PathVariable int id) {
        Map<String, Object> convo = owned(request, id);
        List<Map<String, Object>> messages = new ArrayList<>();
        for (Map<String, Object> m : repo.listMessages(id)) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("role", m.get("role"));
            out.put("content", m.get("content"));
            out.put("sources", parseArray((String) m.get("sources")));
            out.put("unverified_codes", parseArray((String) m.get("unverified_codes")));
            out.put("created_at", m.get("created_at"));
            messages.add(out);
        }
        Map<String, Object> out = new LinkedHashMap<>(convo);
        out.put("messages", messages);
        return out;
    }

    @PostMapping("/api/agent/conversations/{id}/messages")
    @Operation(summary = "Append messages to a conversation",
            description = "`{\"messages\": [{\"role\": \"user\"|\"assistant\", \"content\": \"...\", "
                    + "\"sources\": [...], \"unverified_codes\": [...]}]}` — normally one user + one "
                    + "assistant turn after each successful exchange. Bumps updated_at.")
    public Map<String, Object> append(HttpServletRequest request, @PathVariable int id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        owned(request, id);
        List<Map<String, Object>> turns = messages(body == null ? null : body.get("messages"));
        if (turns.isEmpty()) {
            throw new ApiExceptionHandler.BadRequestException("messages is required");
        }
        String now = now();
        for (Map<String, Object> t : turns) {
            repo.insertMessage(id, (String) t.get("role"), (String) t.get("content"),
                    (String) t.get("sources"), (String) t.get("unverified_codes"), now);
        }
        repo.touchConversation(id, now);
        return Map.of("ok", true, "updated_at", now);
    }

    @PatchMapping("/api/agent/conversations/{id}")
    @Operation(summary = "Rename a conversation",
            description = "`{\"title\": \"...\"}`.")
    public Map<String, Object> rename(HttpServletRequest request, @PathVariable int id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        owned(request, id);
        String title = clampTitle(str(body, "title"));
        if (title.isBlank()) {
            throw new ApiExceptionHandler.BadRequestException("title is required");
        }
        String now = now();
        repo.renameConversation(id, title, now);
        return Map.of("ok", true, "title", title, "updated_at", now);
    }

    @DeleteMapping("/api/agent/conversations/{id}")
    @Operation(summary = "Delete a conversation",
            description = "Removes the conversation and all its messages.")
    public Map<String, Object> delete(HttpServletRequest request, @PathVariable int id) {
        owned(request, id);
        repo.deleteConversation(id);
        return Map.of("ok", true);
    }

    // ---------------------------------------------------------------------

    /** The conversation, or 404 — a foreign user's id is indistinguishable from a missing one. */
    private Map<String, Object> owned(HttpServletRequest request, int id) {
        Map<String, Object> convo = repo.findConversation(id, principal(request).userId());
        if (convo == null) {
            throw new ApiExceptionHandler.NotFoundException();
        }
        return convo;
    }

    /** Validate the append batch; sources/unverified_codes re-serialized to JSON text. */
    private List<Map<String, Object>> messages(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        if (list.size() > MAX_APPEND_BATCH) {
            throw new ApiExceptionHandler.BadRequestException(
                    "too many messages in one append (max " + MAX_APPEND_BATCH + ")");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) {
                continue;
            }
            Object role = m.get("role");
            Object content = m.get("content");
            if (!(role instanceof String r) || !(r.equals("user") || r.equals("assistant"))
                    || !(content instanceof String c) || c.isBlank()) {
                throw new ApiExceptionHandler.BadRequestException(
                        "each message needs role user|assistant and non-blank content");
            }
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("role", r);
            t.put("content", c.length() > MAX_CONTENT_CHARS ? c.substring(0, MAX_CONTENT_CHARS) : c);
            t.put("sources", stringArrayJson(m.get("sources")));
            t.put("unverified_codes", stringArrayJson(m.get("unverified_codes")));
            out.add(t);
        }
        return out;
    }

    /** A client array of strings → compact JSON text, or null when absent/empty. */
    private String stringArrayJson(Object raw) {
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            return null;
        }
        List<String> strings = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof String s && !s.isBlank()) {
                strings.add(s);
            }
        }
        return strings.isEmpty() ? null : json.writeValueAsString(strings);
    }

    /** Stored JSON-array text → list for the response (empty on null/bad data). */
    private List<String> parseArray(String stored) {
        if (stored == null || stored.isBlank()) {
            return List.of();
        }
        try {
            Object v = json.readValue(stored, Object.class);
            if (v instanceof List<?> list) {
                List<String> out = new ArrayList<>();
                for (Object o : list) {
                    if (o instanceof String s) {
                        out.add(s);
                    }
                }
                return out;
            }
        } catch (RuntimeException ignored) {
            // corrupt row — surface the message without its citations
        }
        return List.of();
    }

    private static String str(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        return v instanceof String s ? s.strip() : "";
    }

    private static String clampTitle(String title) {
        return title.length() > MAX_TITLE ? title.substring(0, MAX_TITLE - 1) + "…" : title;
    }

    private static String now() {
        return LocalDateTime.now().format(TS);
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
}
