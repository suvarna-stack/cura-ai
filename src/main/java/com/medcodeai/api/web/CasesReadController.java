package com.medcodeai.api.web;

import com.medcodeai.api.service.CasesCache;
import com.medcodeai.api.service.CasesViewService;
import com.medcodeai.api.service.WorkingStateService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * The two read endpoints. Clean REST paths — the legacy ".json" suffix (a
 * static-file convention the old frontend depended on) is gone: this backend
 * owns the contract now and the next frontend is built against it
 * (docs/api-contract.md).
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
    @GetMapping("/api/cases")
    public Map<String, Object> cases() {
        return cache.get(views::buildCasesPayload);
    }

    // app.py:241 — detail + codeEdits/reportDraft, ALWAYS present (null when
    // unset): the working state belongs to the detail payload even when empty
    @GetMapping("/api/cases/{caseId}")
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
