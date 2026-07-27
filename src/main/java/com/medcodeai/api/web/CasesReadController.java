package com.medcodeai.api.web;

import com.medcodeai.api.service.CasesCache;
import com.medcodeai.api.service.CasesViewService;
import com.medcodeai.api.service.WorkingStateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "cases (read)", description = "Dashboard payload and case detail")
@SecurityRequirement(name = "bearerAuth") // Phase 3: the whole case surface needs a login token
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
    @Operation(summary = "The dashboard payload",
            description = "Lists **OPD visits only** (`encountertype = '0'`), split into "
                    + "`complete`, `incompleteGroups` (sorted by size desc, then label), "
                    + "`reopened` (reopened, awaiting re-approval) and `finished` (approved). "
                    + "The four collections are mutually exclusive — every case appears in "
                    + "exactly one. Served from an in-process cache, rebuilt after any "
                    + "approve / reopen / demo-reset — code and draft saves do not "
                    + "invalidate it.\n\n"
                    + "Example below is trimmed to one card; see `docs/api-contract.md` for "
                    + "every field and its DB source.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = """
                    {
                      "stats": {"total": 1101, "complete": 777, "incomplete": 296, "reopened": 3, "finished": 25},
                      "complete": [
                        {
                          "id": "690003026",
                          "patient": null,
                          "hn": null,
                          "dept": "Medicine",
                          "ward": null,
                          "group": "Medicine",
                          "confidence": null,
                          "severity": "medium",
                          "coverage": "UCS_89_I",
                          "coverageLabel": null,
                          "coverageFamily": "UCS",
                          "coders": ["demo.coder"],
                          "encountertype": "0",
                          "ccpi": "Fever and cough for 3 days …",
                          "cc": "Fever and cough for 3 days",
                          "pi": "",
                          "codes": [{"code": "E11.9", "system": "ICD-10", "role": "principal_diagnosis"}],
                          "orders": {"lab": 2, "medicine": 3},
                          "orderNames": {"lab": ["CBC", "Urinalysis"], "medicine": ["Paracetamol 500 mg"]},
                          "created_at": null,
                          "updated_at": null,
                          "revenue_impact": null
                        }
                      ],
                      "incompleteGroups": [
                        {
                          "id": "medicine",
                          "label": "Medicine Group",
                          "total": 123,
                          "cases": [{"id": "690003027", "missing": "Principal diagnosis, Discharge summary"}]
                        }
                      ],
                      "reopened": [
                        {
                          "id": "690003042",
                          "reopened": true,
                          "reopenedAt": "2026-07-23",
                          "reopenedBy": "web.coder"
                        }
                      ],
                      "finished": [
                        {
                          "id": "690003001",
                          "codedDate": "2026-07-20",
                          "coder": "demo.coder",
                          "coderId": "demo.coder",
                          "drg": "—",
                          "reopenable": true
                        }
                      ]
                    }
                    """)))
    public Map<String, Object> cases() {
        return cache.get(views::buildCasesPayload);
    }

    // app.py:241 — detail + codeEdits/reportDraft, ALWAYS present (null when
    // unset): the working state belongs to the detail payload even when empty
    @GetMapping("/api/cases/{caseId}")
    @Operation(summary = "Case detail",
            description = "Serves ALL cases, IPD included (unlike the OPD-only dashboard), so "
                    + "`hn`-type fields carry real values here when the extract has them. "
                    + "`codeEdits` / `reportDraft` are the coder's saved working state and are "
                    + "always present, `null` when unset.\n\n"
                    + "Example below is trimmed; datetimes are raw hospital text — treat as "
                    + "opaque display strings.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = """
                    {
                      "case": {
                        "case_id": "690003026",
                        "patient_ref": "690003026",
                        "encountertype": "1",
                        "sex": "F",
                        "birthdate": "1961-01-19",
                        "ageyear": "65,2,13",
                        "admissiondatetime": "2026-04-01 06:45:00",
                        "dischargedatetime": null,
                        "completeness_status": "complete",
                        "missing_detail": null,
                        "disease_group": "Medicine",
                        "severity_level": "medium",
                        "case_status": "open",
                        "fetched_at": "2026-07-20 09:00:00"
                      },
                      "coverage": {
                        "coverage_code": "UCS_89_I",
                        "scheme_family": "UCS",
                        "label_th": null,
                        "label_en": null,
                        "payer": "NHSO"
                      },
                      "sections": [
                        {
                          "documenttype": "OPD Card",
                          "fieldname": "Chief Complaint",
                          "value": "Fever and cough for 3 days",
                          "recorddatetime": "2026-04-01 06:45:00"
                        }
                      ],
                      "codes": [
                        {
                          "code": "E11.9",
                          "code_system": "ICD-10",
                          "description": "Type 2 diabetes mellitus without complications",
                          "code_role": "principal_diagnosis",
                          "source": "imported_from_imed"
                        }
                      ],
                      "orders": [
                        {
                          "order_category": "lab",
                          "imed_source": "LAB",
                          "order_name": "CBC",
                          "ordered_at": "2026-04-01 07:10:00"
                        }
                      ],
                      "codeEdits": null,
                      "reportDraft": null
                    }
                    """)))
    @ApiResponse(responseCode = "404", description = "Unknown case",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"not found\"}")))
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
