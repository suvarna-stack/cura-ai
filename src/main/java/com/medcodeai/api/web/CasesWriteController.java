package com.medcodeai.api.web;

import com.medcodeai.api.repo.CasesRepository;
import com.medcodeai.api.repo.WorkingStateRepository;
import com.medcodeai.api.service.WriteGate;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Write endpoints. Request bodies arrive as raw bytes and are parsed manually
 * so malformed JSON degrades to null exactly like Flask's
 * request.get_json(silent=True) — producing Flask's own 400 bodies, never
 * Spring's default error page.
 */
@RestController
public class CasesWriteController {

    private final CasesRepository cases;
    private final WorkingStateRepository workingState;
    private final WriteGate writeGate;
    private final JsonMapper json = new JsonMapper();

    public CasesWriteController(CasesRepository cases, WorkingStateRepository workingState, WriteGate writeGate) {
        this.cases = cases;
        this.workingState = workingState;
        this.writeGate = writeGate;
    }

    // app.py:255 put_codes() — body is a bare StoredCode[] array
    @PutMapping("/api/cases/{caseId}/codes")
    public Map<String, Object> putCodes(@PathVariable String caseId,
                                        @RequestBody(required = false) byte[] body) {
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

    // app.py:276 put_draft() — DEPRECATED (Edit Report removed 15 Jul 2026) but kept
    @PutMapping("/api/cases/{caseId}/draft")
    public Map<String, Object> putDraft(@PathVariable String caseId,
                                        @RequestBody(required = false) byte[] body) {
        Object parsed = parseSilent(body);
        if (!(parsed instanceof Map<?, ?> m) || !(m.get("text") instanceof String text)) {
            throw new ApiExceptionHandler.BadRequestException("expected {\"text\": \"...\"}");
        }
        writeGate.locked(() -> {
            if (!cases.caseExists(caseId)) {
                throw new ApiExceptionHandler.NotFoundException();
            }
            workingState.upsertDraft(caseId, text, nowStr());
            return null;
        });
        return ok();
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
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    static Map<String, Object> ok() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", true);
        return m;
    }
}
