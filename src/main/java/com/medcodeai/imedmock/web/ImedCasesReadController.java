package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.repo.ImedReadRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

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

    /** Accepted filter formats; a date-only bound is widened to the whole day. */
    private static final Pattern DT_PARAM =
            Pattern.compile("^\\d{4}-\\d{2}-\\d{2}([ T]\\d{2}:\\d{2}(:\\d{2})?)?$");

    @GetMapping("/api/cases")
    @Operation(summary = "All visits — MedHack_Patient",
            description = "Optionally windowed. `from`/`to` filter on the VISIT datetime "
                    + "(admissiondatetime, else the datetime encoded in the transaction number), "
                    + "`changed_since` on when the visit's code rows last changed (updated_at, "
                    + "floored at the visit datetime). All bounds inclusive, format "
                    + "`YYYY-MM-DD` or `YYYY-MM-DD HH:MM[:SS]` — a bare date means start-of-day "
                    + "(`from`/`changed_since`) or end-of-day (`to`).")
    public List<Map<String, Object>> cases(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(name = "changed_since", required = false) String changedSince) {
        return repo.cases(normalize("from", from, "00:00:00"),
                normalize("to", to, "23:59:59"),
                normalize("changed_since", changedSince, "00:00:00"));
    }

    private static String normalize(String name, String value, String timeIfDateOnly) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim().replace('T', ' ');
        if (!DT_PARAM.matcher(v).matches()) {
            throw new ApiExceptionHandler.BadRequestException(
                    name + " must be YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS]");
        }
        return v.length() == 10 ? v + " " + timeIfDateOnly : v;
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

    // ---- reference catalogs (code master, not per-case) --------------------

    @GetMapping("/api/icd10-codes")
    @Operation(summary = "ICD-10 reference catalog — imed.icd_10",
            description = "The hospital's ICD-10 code master; MedCode AI mirrors it during sync")
    public List<Map<String, Object>> icd10Codes() {
        return repo.icd10Catalog();
    }

    @GetMapping("/api/icd9-codes")
    @Operation(summary = "ICD-9 reference catalog — imed.icd_9",
            description = "The hospital's ICD-9 procedure code master; MedCode AI mirrors it during sync")
    public List<Map<String, Object>> icd9Codes() {
        return repo.icd9Catalog();
    }

    private void requireCase(String tn) {
        if (!repo.caseExists(tn)) {
            throw new ApiExceptionHandler.NotFoundException();
        }
    }
}
