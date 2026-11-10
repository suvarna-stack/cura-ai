package com.medcodeai.api.client;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * HTTP to the MedCode RAG service (the FastAPI app in the sibling RAG repo,
 * default http://localhost:8000). The admin "AI Training" page drives it
 * through our /api/admin/knowledge/** proxy routes (KnowledgeController), so
 * the browser only ever talks to this API and the RAG service can stay
 * unauthenticated on an internal address.
 *
 * "Training" on the RAG side means indexing documents (chunk -> embed ->
 * knowledge graph), not fine-tuning model weights. Uploads and rebuilds are
 * accepted with 202 and processed in the background; progress is polled via
 * documents().
 *
 * The read timeout is generous because /chat runs a local LLM on CPU (a 3B
 * model generates ~2-4 tok/s) and ingestion endpoints may block on model
 * loading the first time. A first-ever /chat additionally downloads the model
 * weights — if that outruns even this timeout, the download continues
 * server-side and a retry succeeds.
 */
@Component
public class RagApiClient {

    private static final ParameterizedTypeReference<List<Map<String, Object>>> ROWS =
            new ParameterizedTypeReference<>() {
            };

    private static final ParameterizedTypeReference<Map<String, Object>> OBJECT =
            new ParameterizedTypeReference<>() {
            };

    private final String base;
    private final RestClient http;
    private final HttpClient jdk;
    private final JsonMapper json = new JsonMapper();

    public RagApiClient() {
        String env = System.getenv("RAG_API_BASE");
        this.base = (env == null || env.isEmpty()) ? "http://localhost:8000" : env;
        // HTTP/1.1 only: the JDK client's default h2c upgrade breaks uvicorn
        // ("Unsupported upgrade request" -> multipart bodies arrive mangled).
        this.jdk = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(2)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(Duration.ofSeconds(600));
        this.http = RestClient.builder().baseUrl(base).requestFactory(factory).build();
    }

    /** GET /documents — every known document with live ingest status/progress. */
    public List<Map<String, Object>> documents() {
        try {
            List<Map<String, Object>> body = http.get().uri("/documents").retrieve().body(ROWS);
            return body == null ? List.of() : body;
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** GET /stats — index size, model names, graph stats. */
    public Map<String, Object> stats() {
        try {
            return http.get().uri("/stats").retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** POST /documents/upload (multipart) — 202, ingest continues in background.
     *  docType tags the document (icd10 | icd9cm); the RAG side stamps it into
     *  every chunk's metadata. Null = untagged (legacy uploads). */
    public Map<String, Object> upload(String filename, byte[] bytes, String docType) {
        ByteArrayResource resource = new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", resource);
        if (docType != null && !docType.isBlank()) {
            form.add("doc_type", docType);
        }
        try {
            return http.post().uri("/documents/upload")
                    .contentType(MediaType.MULTIPART_FORM_DATA).body(form)
                    .retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** DELETE /documents/{source} — removes chunks from vector store + graph. */
    public Map<String, Object> deleteDocument(String source) {
        try {
            return http.delete().uri("/documents/{source}", source).retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** PATCH /documents/{source} — filename and/or doc_type ({"filename": ...,
     *  "doc_type": ...}, either may be absent; a doc_type change re-tags the
     *  indexed chunks in place on the RAG side). */
    public Map<String, Object> updateDocument(String source, Map<String, Object> body) {
        try {
            return http.patch().uri("/documents/{source}", source)
                    .contentType(MediaType.APPLICATION_JSON).body(body)
                    .retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** PUT /documents/order — read-first priority for one upload box. */
    public Object orderDocuments(Map<String, Object> body) {
        try {
            return http.put().uri("/documents/order")
                    .contentType(MediaType.APPLICATION_JSON).body(body)
                    .retrieve().body(Object.class);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** GET /documents/codes — ICD code + title pairs extracted from the uploaded PDFs. */
    public Map<String, Object> extractedCodes() {
        try {
            return http.get().uri("/documents/codes").retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** POST /documents/rebuild — 202, wipes and re-ingests every saved PDF. */
    public Map<String, Object> rebuild() {
        try {
            return http.post().uri("/documents/rebuild").retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** POST /retrieve — retrieval-only test, no LLM generation (fast). */
    public Map<String, Object> retrieve(Map<String, Object> body) {
        return postJson("/retrieve", body);
    }

    /** POST /chat — full RAG answer from the local LLM (slow on CPU). */
    public Map<String, Object> chat(Map<String, Object> body) {
        return postJson("/chat", body);
    }

    /** POST /chat/stream — pipe the RAG SSE byte stream through untouched.
     *  Per-chunk flush is what makes it a live stream; buffering the whole
     *  body would silently degrade this back to a blocking call. */
    public void streamChat(Map<String, Object> body, OutputStream out) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(base + "/chat/stream"))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(600))
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                    .build();
            HttpResponse<InputStream> resp =
                    jdk.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = resp.body()) {
                if (resp.statusCode() != 200) {
                    in.readAllBytes(); // drain
                    writeSseError(out, "RAG service rejected the stream ("
                            + resp.statusCode() + ")");
                    return;
                }
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    out.flush();
                }
            }
        } catch (IOException e) {
            // Headers are already out — deliver the failure as a stream event.
            writeSseError(out, "RAG service not reachable — is it running on "
                    + base + "?");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            writeSseError(out, "stream interrupted");
        }
    }

    private void writeSseError(OutputStream out, String message) {
        try {
            String event = "data: " + json.writeValueAsString(
                    Map.of("type", "error", "message", message)) + "\n\n";
            out.write(event.getBytes(StandardCharsets.UTF_8));
            out.flush();
        } catch (IOException e) {
            throw new UncheckedIOException(e); // client hung up — nothing to do
        }
    }

    /** POST /suggest — ICD-9/10 suggestions from clinical text + knowledge index. */
    public Map<String, Object> suggest(Map<String, Object> body) {
        return postJson("/suggest", body);
    }

    // --- Suggest & Learn: coder-taught rules layered over the references ---

    /** POST /learn/classify — is this chat message a question or a rule? */
    public Map<String, Object> classifyIntent(Map<String, Object> body) {
        return postJson("/learn/classify", body);
    }

    /** POST /learn/extract — free text -> draft note. Stores nothing. */
    public Map<String, Object> extractNote(Map<String, Object> body) {
        return postJson("/learn/extract", body);
    }

    /** POST /learn/notes — save a confirmed draft and index it for retrieval. */
    public Map<String, Object> saveNote(Map<String, Object> body) {
        return postJson("/learn/notes", body);
    }

    /** GET /learn/notes — every taught rule, newest first. */
    public Map<String, Object> notes() {
        try {
            return http.get().uri("/learn/notes").retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /**
     * GET /learn/notes/{id} — one taught rule, or null when there is no such
     * id. RAG holds no identity, so this is how the API reads a rule's author
     * before letting anyone edit, mute or delete it.
     */
    public Map<String, Object> note(String noteId) {
        try {
            return http.get().uri("/learn/notes/{id}", noteId).retrieve().body(OBJECT);
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 404) {
                return null;
            }
            throw e;
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** PATCH /learn/notes/{id}?active= — mute or un-mute a rule. */
    public Map<String, Object> toggleNote(String noteId, boolean active) {
        try {
            return http.patch()
                    .uri(uriBuilder -> uriBuilder.path("/learn/notes/{id}")
                            .queryParam("active", active).build(noteId))
                    .retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** DELETE /learn/notes/{id} — forget a rule (note + indexed chunk). */
    public Map<String, Object> deleteNote(String noteId) {
        try {
            return http.delete().uri("/learn/notes/{id}", noteId).retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    /** POST /learn/match — which taught rules apply to this narrative? */
    public Map<String, Object> matchNotes(Map<String, Object> body) {
        return postJson("/learn/match", body);
    }

    private Map<String, Object> postJson(String uri, Map<String, Object> body) {
        try {
            return http.post().uri(uri)
                    .contentType(MediaType.APPLICATION_JSON).body(body)
                    .retrieve().body(OBJECT);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    private IllegalStateException unreachable(Exception e) {
        return new IllegalStateException("RAG API not reachable at " + base
                + " — is the RAG service running? (cd ../../ai && python run.py)", e);
    }
}
