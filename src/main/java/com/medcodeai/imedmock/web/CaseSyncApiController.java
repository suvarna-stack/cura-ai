package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.repo.ImedCaseSyncRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * READ side of the "MedCode AI Case Data API" contract — R1-R6, the endpoints
 * MedCode AI asked the hospital to build. Mocked here so development runs at
 * full speed while the hospital implements its side; when the real API lands,
 * medcode-api swaps IMED_API_BASE and nothing else.
 *
 * Faithfulness is the whole point of this class, so the contract's limits are
 * enforced rather than waved through: R2 refuses more than 20 visit ids, R3
 * refuses a window longer than 31 days, and both answer in the hospital's
 * STATUS_BUSINESS_ERROR envelope. A shortcut here ("the cap doesn't matter
 * locally") would only surface on cutover day.
 *
 * These sit on /api/v1 alongside the write endpoints, so the existing Bearer
 * gate (ApiV1AuthInterceptor) covers them — unlike the older extract reads on
 * /api/cases/**, which stay open and are superseded by this surface.
 */
@RestController
@Tag(name = "Read (contract R1-R6) — case data for MedCode AI",
        description = "The nested case-object API: poll for changes, sync by ids or period, "
                + "code catalogues, and the pre-sync schema check")
@SecurityRequirement(name = "bearerAuth")
public class CaseSyncApiController {

    /** R2's batch cap and R3's window cap, both from the contract. */
    static final int MAX_VISIT_IDS = 20;
    static final int MAX_PERIOD_DAYS = 31;

    /** ISO 8601 date, or date-time with optional seconds. */
    private static final Pattern ISO_DT =
            Pattern.compile("^\\d{4}-\\d{2}-\\d{2}([ T]\\d{2}:\\d{2}(:\\d{2})?)?$");

    /**
     * Every field this API serves, as the contract's block.field names — the
     * answer set for R6. Kept in the case object's own order so a diff against
     * the contract document reads top to bottom.
     */
    static final Set<String> SUPPORTED_FIELDS = new LinkedHashSet<>(List.of(
            "visit.visit_id", "visit.admission_number", "visit.encounter_type", "visit.sex",
            "visit.birth_date", "visit.age_year", "visit.is_pregnant", "visit.admission_datetime",
            "visit.discharge_datetime", "visit.discharge_type", "visit.discharge_status",
            "visit.health_coverage", "visit.department", "visit.ward", "visit.coding_status",
            "visit.last_changed_at",
            "documents.document_type", "documents.section_name", "documents.text",
            "documents.recorded_at",
            "record_results.name", "record_results.tmlt", "record_results.cgd",
            "record_results.document_type", "record_results.field_id", "record_results.field_name",
            "record_results.subfield_name", "record_results.value", "record_results.unit",
            "record_results.recorded_at",
            "diagnoses.object_id", "diagnoses.icd10_code", "diagnoses.description",
            "diagnoses.diagnosis_type", "diagnoses.updated_at",
            "procedures.object_id", "procedures.icd9_code", "procedures.description",
            "procedures.operation_type", "procedures.operation_start", "procedures.operation_end",
            "procedures.updated_at",
            "drug_orders.object_id", "drug_orders.name", "drug_orders.item_id",
            "drug_orders.tmt_code", "drug_orders.dosage_signature",
            "drug_orders.dosage_instruction", "drug_orders.quantity", "drug_orders.remark",
            "drug_orders.received_at",
            "lab_results.object_id", "lab_results.panel_name", "lab_results.panel_tmlt",
            "lab_results.panel_cgd", "lab_results.item_id", "lab_results.item_name",
            "lab_results.item_tmlt", "lab_results.item_cgd", "lab_results.value",
            "lab_results.unit", "lab_results.collected_at", "lab_results.reported_at",
            "vitals.measured_at", "vitals.temperature", "vitals.systolic", "vitals.diastolic",
            "vitals.heart_rate", "vitals.oxygen_saturation", "vitals.weight", "vitals.height",
            "ward_movements.department", "ward_movements.ward", "ward_movements.bed_number",
            "ward_movements.service_id", "ward_movements.start_at", "ward_movements.end_at",
            "billing_items.object_id", "billing_items.name", "billing_items.item_id",
            "billing_items.tmlt", "billing_items.cgd", "billing_items.fee_schedule",
            "billing_items.quantity", "billing_items.remark", "billing_items.verified_at"));

    private final ImedCaseSyncRepository repo;

    public CaseSyncApiController(ImedCaseSyncRepository repo) {
        this.repo = repo;
    }

    // ---- R1 ----------------------------------------------------------------

    @PostMapping("/api/v1/cases/check")
    @Operation(summary = "R1 — update check",
            description = "Did anything change after `changed_since`? Answers with the ids of "
                    + "changed and new visits. No clinical data: this is the cheap poll "
                    + "MedCode AI runs every few minutes.")
    @ApiResponse(responseCode = "200", description = "has_changes + visit_ids (empty array if none)")
    @ApiResponse(responseCode = "400", description = "invalid_request — missing or unparseable changed_since")
    public Map<String, Object> check(@RequestBody(required = false) Map<String, Object> body) {
        String changedSince = requiredDateTime(body, "changed_since");
        List<String> ids = repo.changedVisitIds(changedSince);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("has_changes", !ids.isEmpty());
        out.put("visit_ids", ids);
        return out;
    }

    // ---- R2 ----------------------------------------------------------------

    @PostMapping("/api/v1/cases/sync")
    @Operation(summary = "R2 — sync cases by visit ids",
            description = "Full case data for up to " + MAX_VISIT_IDS + " visit ids. Ids the "
                    + "hospital does not know come back in `not_found`; the known ones are "
                    + "still served, which is not an error for the whole request.")
    @ApiResponse(responseCode = "200", description = "cases[] + not_found[]")
    @ApiResponse(responseCode = "400", description = "invalid_request — visit_ids missing or not a list")
    @ApiResponse(responseCode = "422", description = "too_many_visit_ids — more than the batch cap")
    public Map<String, Object> sync(@RequestBody(required = false) Map<String, Object> body) {
        List<String> requested = requiredIdList(body);
        if (requested.size() > MAX_VISIT_IDS) {
            throw new ApiExceptionHandler.ImedUnprocessableException(
                    "too_many_visit_ids", "จำนวน visit เกินเพดานที่กำหนดต่อการเรียก");
        }
        List<Map<String, Object>> cases = repo.cases(requested);

        Set<String> found = new LinkedHashSet<>();
        for (Map<String, Object> c : cases) {
            @SuppressWarnings("unchecked")
            Map<String, Object> visit = (Map<String, Object>) c.get("visit");
            found.add((String) visit.get("visit_id"));
        }
        List<String> notFound = new ArrayList<>();
        for (String id : requested) {
            if (!found.contains(id) && !notFound.contains(id)) {
                notFound.add(id);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cases", cases);
        out.put("not_found", notFound);
        return out;
    }

    // ---- R3 ----------------------------------------------------------------

    @PostMapping("/api/v1/cases/sync-by-period")
    @Operation(summary = "R3 — sync cases by visit-date period",
            description = "Same response as R2, selected by a visit-date window instead of ids. "
                    + "Both ends included. The visit date is admission_datetime when filled, "
                    + "else the datetime encoded in the transaction number. Window length is "
                    + "capped at " + MAX_PERIOD_DAYS + " days.")
    @ApiResponse(responseCode = "200", description = "cases[] — same structure as R2")
    @ApiResponse(responseCode = "400", description = "invalid_request — from/to missing or unparseable")
    @ApiResponse(responseCode = "422", description = "period_too_long — window longer than the cap")
    public Map<String, Object> syncByPeriod(@RequestBody(required = false) Map<String, Object> body) {
        String from = requiredDateTime(body, "from");
        String to = requiredDateTime(body, "to");
        if (parse(from).plusDays(MAX_PERIOD_DAYS).isBefore(parse(to))) {
            throw new ApiExceptionHandler.ImedUnprocessableException(
                    "period_too_long", "ช่วงวันที่ยาวเกินเพดานที่กำหนด");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cases", repo.cases(repo.visitIdsInPeriod(from, to)));
        return out;
    }

    // ---- R4 / R5 -----------------------------------------------------------

    @GetMapping("/api/v1/catalog/icd10")
    @Operation(summary = "R4 — ICD-10 code master",
            description = "The hospital's own ICD-10 list, so MedCode AI's search and validation "
                    + "match the hospital's rather than a public list. `edition` is null until "
                    + "the hospital's catalogue carries one.")
    public List<Map<String, Object>> icd10Catalog() {
        return repo.catalog("icd_10");
    }

    @GetMapping("/api/v1/catalog/icd9")
    @Operation(summary = "R5 — ICD-9 code master",
            description = "The hospital's own ICD-9 procedure list; same shape as R4.")
    public List<Map<String, Object>> icd9Catalog() {
        return repo.catalog("icd_9");
    }

    // ---- R6 ----------------------------------------------------------------

    @PostMapping("/api/v1/contract/check")
    @Operation(summary = "R6 — data-contract check",
            description = "Schema gate called at service start and before every sync run: "
                    + "MedCode AI sends the block.field names it needs and the hospital answers "
                    + "whether all of them are served right now. A missing field stops the sync "
                    + "cleanly before any data is touched, instead of half-importing a case.")
    @ApiResponse(responseCode = "200", description = "valid — plus `missing` when valid is false")
    @ApiResponse(responseCode = "400", description = "invalid_request — required_fields missing or not a list")
    public Map<String, Object> contractCheck(@RequestBody(required = false) Map<String, Object> body) {
        Object raw = body == null ? null : body.get("required_fields");
        if (!(raw instanceof List<?> list)) {
            throw new ApiExceptionHandler.ImedBusinessException("required_fields must be an array of strings");
        }
        List<String> missing = new ArrayList<>();
        for (Object o : list) {
            String field = o == null ? null : o.toString();
            if (field != null && !SUPPORTED_FIELDS.contains(field) && !missing.contains(field)) {
                missing.add(field);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("valid", missing.isEmpty());
        if (!missing.isEmpty()) {
            out.put("missing", missing); // absent when valid, per the contract's examples
        }
        return out;
    }

    // ---- request validation -------------------------------------------------

    /**
     * A required ISO 8601 bound. A bare date is widened to the start of that
     * day — the contract's own samples send both forms, and a caller asking for
     * "2026-08-09" means the whole day, not midnight exactly.
     */
    private static String requiredDateTime(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        String s = v == null ? null : v.toString().trim();
        if (s == null || s.isEmpty()) {
            throw new ApiExceptionHandler.ImedBusinessException(key + " is required");
        }
        if (!ISO_DT.matcher(s).matches()) {
            throw new ApiExceptionHandler.ImedBusinessException(
                    key + " must be ISO 8601 (2026-08-10T14:30:00)");
        }
        return s.length() == 10 ? s + "T00:00:00" : s;
    }

    private static LocalDateTime parse(String iso) {
        try {
            return LocalDateTime.parse(iso.replace(' ', 'T'));
        } catch (DateTimeParseException e) {
            // ISO_DT already matched, so this is the seconds-less form
            return LocalDateTime.parse(iso.replace(' ', 'T') + ":00");
        }
    }

    private static List<String> requiredIdList(Map<String, Object> body) {
        Object raw = body == null ? null : body.get("visit_ids");
        if (!(raw instanceof List<?> list)) {
            throw new ApiExceptionHandler.ImedBusinessException("visit_ids must be an array of strings");
        }
        List<String> ids = new ArrayList<>();
        for (Object o : list) {
            if (o != null && !o.toString().isBlank()) {
                ids.add(o.toString());
            }
        }
        return ids;
    }
}
