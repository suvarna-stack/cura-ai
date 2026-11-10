package com.medcodeai.api.web;

import com.medcodeai.api.client.RagApiClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The coder-facing AI Agent chat — a thin authenticated proxy to the RAG
 * service's /chat (any valid token, either role; guarded via /api/agent/** in
 * WebConfig). Unlike the admin-only /api/admin/knowledge/** surface, this is
 * the route the cases app's Agent page talks to.
 *
 * The RAG side answers bilingually (EN/TH follows the question language) and
 * accepts prior turns as `history`, so the conversation memory lives in the
 * browser and this proxy stays stateless. max_new_tokens is capped lower than
 * the knowledge console's default because the local CPU model generates
 * slowly and the coder page is interactive.
 */
@RestController
@Tag(name = "agent", description = "Coder AI Agent chat (RAG-grounded, EN/TH)")
@SecurityRequirement(name = "bearerAuth")
public class AgentController {

    private static final int MAX_HISTORY_TURNS = 40;
    // Sized for the Ollama/GPU backend (~seconds); on the CPU fallback this
    // is ~2 minutes — drop toward 140 if running transformers-only.
    private static final int DEFAULT_MAX_NEW_TOKENS = 320;
    private static final int MAX_MAX_NEW_TOKENS = 512;

    private final RagApiClient rag;
    private final JsonMapper json = new JsonMapper();

    public AgentController(RagApiClient rag) {
        this.rag = rag;
    }

    @PostMapping("/api/agent/chat")
    @Operation(summary = "Ask the AI agent (RAG chat)",
            description = "`{\"question\": \"...\", \"history\": [{\"role\": \"user\"|\"assistant\", "
                    + "\"content\": \"...\"}]}` (+ optional `max_new_tokens`, ≤512). Retrieval-"
                    + "grounded answer from the local LLM with source citations; answers follow "
                    + "the question's language (English or Thai). Slow on CPU — expect tens of "
                    + "seconds, minutes on the first call while the model loads.")
    public Map<String, Object> chat(@RequestBody(required = false) byte[] body) {
        return forward(() -> rag.chat(chatBody(body)));
    }

    @PostMapping(value = "/api/agent/chat/stream",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Ask the AI agent (streaming SSE)",
            description = "Same body as /api/agent/chat. Server-sent events: "
                    + "`{type: \"meta\", mode, contexts}` first (sources), then "
                    + "`{type: \"delta\", text}` answer pieces, then "
                    + "`{type: \"done\", unverified_codes}` (codes the answer cites "
                    + "that appear in no retrieved chunk). On failure a terminal "
                    + "`{type: \"error\", message}` event replaces the HTTP error.")
    public ResponseEntity<StreamingResponseBody> chatStream(
            @RequestBody(required = false) byte[] body) {
        Map<String, Object> payload = chatBody(body); // validate BEFORE headers go out
        StreamingResponseBody stream = out -> rag.streamChat(payload, out);
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .cacheControl(CacheControl.noCache())
                .body(stream);
    }

    // ---------------------------------------------------------------------

    /** Validate + normalize the chat body; only known, sane fields pass through. */
    private Map<String, Object> chatBody(byte[] body) {
        Map<?, ?> in = parseObject(body);
        Object question = in.get("question");
        if (!(question instanceof String q) || q.isBlank()) {
            throw new ApiExceptionHandler.BadRequestException("question is required");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("question", q);
        out.put("history", history(in.get("history")));

        int maxTokens = DEFAULT_MAX_NEW_TOKENS;
        if (in.get("max_new_tokens") instanceof Number n) {
            maxTokens = Math.max(16, Math.min(MAX_MAX_NEW_TOKENS, n.intValue()));
        }
        out.put("max_new_tokens", maxTokens);
        return out;
    }

    /** Keep only well-formed {role: user|assistant, content: non-blank} turns. */
    private List<Map<String, String>> history(Object raw) {
        if (!(raw instanceof List<?> turns)) {
            return List.of();
        }
        List<Map<String, String>> out = new ArrayList<>();
        for (Object t : turns) {
            if (!(t instanceof Map<?, ?> m)) {
                continue;
            }
            if (m.get("role") instanceof String role
                    && (role.equals("user") || role.equals("assistant"))
                    && m.get("content") instanceof String content
                    && !content.isBlank()) {
                out.add(Map.of("role", role, "content", content));
            }
        }
        return out.size() > MAX_HISTORY_TURNS
                ? out.subList(out.size() - MAX_HISTORY_TURNS, out.size())
                : out;
    }

    /** Run a RAG call, translating FastAPI 4xx {"detail": ...} into our 400 shape. */
    private <T> T forward(java.util.function.Supplier<T> call) {
        try {
            return call.get();
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().is4xxClientError()) {
                throw new ApiExceptionHandler.BadRequestException(extractDetail(e));
            }
            throw e;
        }
    }

    private String extractDetail(RestClientResponseException e) {
        try {
            Object v = json.readValue(e.getResponseBodyAsString(StandardCharsets.UTF_8), Object.class);
            if (v instanceof Map<?, ?> m && m.get("detail") instanceof String detail) {
                return detail;
            }
        } catch (RuntimeException ignored) {
            // non-JSON error body — fall through to the status line
        }
        return "RAG service rejected the request (" + e.getStatusCode().value() + ")";
    }

    private Map<?, ?> parseObject(byte[] body) {
        if (body == null || body.length == 0) {
            return Map.of();
        }
        try {
            Object v = json.readValue(new String(body, StandardCharsets.UTF_8), Object.class);
            return v instanceof Map<?, ?> m ? m : Map.of();
        } catch (RuntimeException e) {
            return Map.of();
        }
    }
}
