package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.repo.ImedReadRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * READ direction of the hospital API — "give MedCode AI your case data".
 * One endpoint per extract table; responses are the rows verbatim (exact
 * extract column names, values as stored). 404 when the transaction number is
 * unknown; an existing case with no rows in a table returns [].
 *
 * The @Operation summaries name the source extract table per endpoint — that
 * mapping is what integrators actually need, so it belongs in the generated
 * OpenAPI document and not only in the README.
 */
@RestController
@Tag(name = "Read — give us your case data",
        description = "One endpoint per hospital extract table; rows served verbatim")
@ApiResponse(responseCode = "200", description = "Rows verbatim ([] when the case has none)")
@ApiResponse(responseCode = "404", description = "Unknown transaction number")
public class ImedCasesReadController {

    private final ImedReadRepository repo;

    public ImedCasesReadController(ImedReadRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/api/cases")
    @Operation(summary = "All visits — MedHack_Patient")
    public List<Map<String, Object>> cases() {
        return repo.cases();
    }

    @GetMapping("/api/cases/{tn}/medical-records")
    @Operation(summary = "Clinical notes — MedHack_MedicalRecord")
    public List<Map<String, Object>> medicalRecords(@PathVariable String tn) {
        requireCase(tn);
        return repo.medicalRecords(tn);
    }

    @GetMapping("/api/cases/{tn}/medical-record-results")
    @Operation(summary = "Note results — MedHack_MedicalRecord_result")
    public List<Map<String, Object>> medicalRecordResults(@PathVariable String tn) {
        requireCase(tn);
        return repo.medicalRecordResults(tn);
    }

    @GetMapping("/api/cases/{tn}/diagnoses")
    @Operation(summary = "Diagnoses — MedHack_Diagnosis(ICD10)")
    public List<Map<String, Object>> diagnoses(@PathVariable String tn) {
        requireCase(tn);
        return repo.diagnoses(tn);
    }

    @GetMapping("/api/cases/{tn}/procedures")
    @Operation(summary = "Procedures — MedHack_Procedure(ICD9)")
    public List<Map<String, Object>> procedures(@PathVariable String tn) {
        requireCase(tn);
        return repo.procedures(tn);
    }

    @GetMapping("/api/cases/{tn}/orders/drugs")
    @Operation(summary = "Drug orders — MedHack_OrderDrug")
    public List<Map<String, Object>> orderDrugs(@PathVariable String tn) {
        requireCase(tn);
        return repo.orderDrugs(tn);
    }

    @GetMapping("/api/cases/{tn}/orders/labs")
    @Operation(summary = "Lab orders — MedHack_OrderLAB")
    public List<Map<String, Object>> orderLabs(@PathVariable String tn) {
        requireCase(tn);
        return repo.orderLabs(tn);
    }

    @GetMapping("/api/cases/{tn}/vital-signs")
    @Operation(summary = "Vital signs — MedHack_VitalSign")
    public List<Map<String, Object>> vitalSigns(@PathVariable String tn) {
        requireCase(tn);
        return repo.vitalSigns(tn);
    }

    @GetMapping("/api/cases/{tn}/bed-management")
    @Operation(summary = "Bed movements — MedHack_BedManagement")
    public List<Map<String, Object>> bedManagement(@PathVariable String tn) {
        requireCase(tn);
        return repo.bedManagement(tn);
    }

    @GetMapping("/api/cases/{tn}/billing-items")
    @Operation(summary = "Billing items — MedHack_BillingItem")
    public List<Map<String, Object>> billingItems(@PathVariable String tn) {
        requireCase(tn);
        return repo.billingItems(tn);
    }

    /** The coding/audit status MedCode AI wrote back; 404 while uncoded. */
    @GetMapping("/api/cases/{tn}/coding-status")
    @Operation(summary = "Coding status — MedHack_CaseCodingStatus",
            description = "What MedCode AI wrote back; 404 while the case is uncoded")
    public Map<String, Object> codingStatus(@PathVariable String tn) {
        requireCase(tn);
        Map<String, Object> row = repo.codingStatus(tn);
        if (row == null) {
            throw new ApiExceptionHandler.NotFoundException();
        }
        return row;
    }

    private void requireCase(String tn) {
        if (!repo.caseExists(tn)) {
            throw new ApiExceptionHandler.NotFoundException();
        }
    }
}
