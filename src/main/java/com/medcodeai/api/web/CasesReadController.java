package com.medcodeai.api.web;

import com.medcodeai.api.service.CasesCache;
import com.medcodeai.api.service.CasesViewService;
import com.medcodeai.api.service.WorkingStateService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * The two read endpoints. Paths keep the literal ".json" suffix — the static
 * export convention baked into src/api/client.ts — so the frontend switches
 * between static files and this server via VITE_API_BASE alone.
 */
@RestController
public class CasesReadController {

    private final CasesViewService views;
    private final CasesCache cache;
    private final WorkingStateService workingState;

    public CasesReadController(CasesViewService views, CasesCache cache, WorkingStateService workingState) {
        this.views = views;
        this.cache = cache;
        this.workingState = workingState;
    }

    // app.py:229 — cached until the next approve/reopen/reset
    @GetMapping("/api/cases.json")
    public Map<String, Object> cases() {
        return cache.get(views::buildCasesPayload);
    }

    // app.py:241 — detail + codeEdits/reportDraft, which are ALWAYS present
    // (null when unset): their presence is the frontend's "live server, not
    // static files" marker (client.ts isLiveDetail)
    @GetMapping("/api/cases/{caseId}.json")
    public Map<String, Object> caseDetail(@PathVariable String caseId) {
        Map<String, Object> detail = views.buildCaseDetail(caseId);
        if (detail == null) {
            throw new ApiExceptionHandler.NotFoundException();
        }
        WorkingStateService.WorkingState ws = workingState.load(caseId);
        detail.put("codeEdits", ws.edits());
        detail.put("reportDraft", ws.draft());
        return detail;
    }
}
