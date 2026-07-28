package com.medcodeai.api.web;

import com.medcodeai.api.client.RagApiClient;
import com.medcodeai.api.service.KnowledgeCodeSyncService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * The admin "AI Training" page — a thin authenticated proxy to the MedCode RAG
 * service (RagApiClient). Lives under /api/admin/**, so AuthInterceptor
 * requires a valid Bearer token AND the admin role; the RAG service itself has
 * no auth and should only be reachable from this backend.
 *
 * RAG-side 4xx errors (e.g. "scanned PDF, no text layer" on upload) carry a
 * FastAPI {"detail": "..."} body; they are re-thrown as BadRequestException so
 * the frontend receives the usual {"error": "..."} contract shape.
 */
@RestController
@Tag(name = "knowledge", description = "AI Training / RAG knowledge base (admin only)")
@SecurityRequirement(name = "bearerAuth")
public class KnowledgeController {

    private final RagApiClient rag;
    private final KnowledgeCodeSyncService codeSync;
    private final JsonMapper json = new JsonMapper();

    public KnowledgeController(RagApiClient rag, KnowledgeCodeSyncService codeSync) {
        this.rag = rag;
        this.codeSync = codeSync;
    }

    @GetMapping("/api/admin/knowledge/docs")
    @Operation(summary = "List knowledge documents",
            description = "Every document the RAG index knows, with live ingest status "
                    + "(`queued` | `processing` | `indexed` | `failed`) and 0-100 `progress`. "
                    + "The training page polls this while anything is ingesting.")
    public List<Map<String, Object>> listDocs() {
        return forward(rag::documents);
    }

    @GetMapping("/api/admin/knowledge/stats")
    @Operation(summary = "Index stats",
            description = "Documents/chunks in the index, embedding + LLM model names, "
                    + "retrieval mode and knowledge-graph size.")
    public Map<String, Object> stats() {
        return forward(rag::stats);
    }

    @PostMapping("/api/admin/knowledge/docs")
    @Operation(summary = "Upload a knowledge document (PDF)",
            description = "Multipart `file`. Accepted immediately; chunking + embedding run in "
                    + "the background on the RAG service — poll the docs list for progress. "
                    + "Scanned/image-only PDFs are rejected with 400.")
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file) {
        String filename = file.getOriginalFilename();
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return forward(() -> rag.upload(
                (filename == null || filename.isBlank()) ? "upload.pdf" : filename, bytes));
    }

    @DeleteMapping("/api/admin/knowledge/docs/{source}")
    @Operation(summary = "Remove a knowledge document",
            description = "Deletes the document's chunks from the vector store and knowledge "
                    + "graph, and its saved PDF from the RAG service.")
    public Map<String, Object> deleteDoc(@PathVariable String source) {
        return forward(() -> rag.deleteDocument(source));
    }

    @PostMapping("/api/admin/knowledge/train")
    @Operation(summary = "Rebuild the index (train)",
            description = "Wipes the vector store + graph and re-ingests every saved document. "
                    + "Returns immediately; poll the docs list until everything is `indexed`.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"status\": \"rebuilding\", \"documents\": 3}")))
    public Map<String, Object> train() {
        return forward(rag::rebuild);
    }

    @PostMapping("/api/admin/knowledge/sync-codes")
    @Operation(summary = "Sync extracted ICD codes into the icd_10 / icd_9 catalogs",
            description = "Scans the uploaded reference documents for code + official-title pairs "
                    + "and upserts them into this database's icd_10 and icd_9 tables. Inserts new "
                    + "codes and fills blank descriptions; existing descriptions are never overwritten.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
            content = @Content(mediaType = "application/json", examples = @ExampleObject(value =
                    "{\"documentsScanned\": 1, \"extracted\": 180, \"added\": 165, "
                            + "\"descriptionsFilled\": 3, \"unchanged\": 12}")))
    public Map<String, Object> syncCodes() {
        return forward(codeSync::syncCodes);
    }

    @PostMapping("/api/admin/knowledge/retrieve")
    @Operation(summary = "Test retrieval",
            description = "`{\"question\": \"...\"}` (+ optional `mode`: `graph`|`plain`, `top_k`). "
                    + "Returns the chunks the index would hand the LLM — no generation, so it's fast.")
    public Map<String, Object> retrieve(@RequestBody(required = false) byte[] body) {
        return forward(() -> rag.retrieve(queryBody(body)));
    }

    @PostMapping("/api/admin/knowledge/chat")
    @Operation(summary = "Test a full AI answer",
            description = "Same body as retrieve (+ optional `max_new_tokens`, `temperature`). "
                    + "Runs the local LLM over the retrieved context — slow on CPU (up to minutes).")
    public Map<String, Object> chat(@RequestBody(required = false) byte[] body) {
        return forward(() -> rag.chat(queryBody(body)));
    }

    // ---------------------------------------------------------------------

    /** Validate + normalize the retrieve/chat body; only known fields pass through. */
    private Map<String, Object> queryBody(byte[] body) {
        Map<?, ?> in = parseObject(body);
        Object question = in.get("question");
        if (!(question instanceof String q) || q.isBlank()) {
            throw new ApiExceptionHandler.BadRequestException("question is required");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("question", q);
        for (String key : List.of("mode", "top_k", "max_new_tokens", "temperature")) {
            Object v = in.get(key);
            if (v != null) {
                out.put(key, v);
            }
        }
        return out;
    }

    /** Run a RAG call, translating FastAPI 4xx {"detail": ...} into our 400 shape. */
    private <T> T forward(Supplier<T> call) {
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
