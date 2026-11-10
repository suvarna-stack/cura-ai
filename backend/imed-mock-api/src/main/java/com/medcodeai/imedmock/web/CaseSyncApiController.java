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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * READ side, mocked to the hospital's Medihack API guide for MedCode (4 Nov
 * 2026) — the five read routes the hospital actually built (R2-R6 of the
 * contract MedCode AI first proposed). R1 ({@code POST /cases/check}, "what
 * changed since T?") was proposed but the hospital parked it: a client
 * re-reads the visit ids it already holds through /cases/sync instead, so
 * the mock no longer serves it either.
 *
 * Faithfulness is the whole point of this class, so the guide's limits are
 * enforced rather than waved through: /cases/sync refuses more than 20 visit
 * ids and an empty list, /cases/sync-by-period refuses a window longer than
 * 31 days or running backwards, and the answers use the hospital's
 * STATUS_BUSINESS_ERROR envelope. A shortcut here ("the cap doesn't matter
 * locally") would only surface on cutover day.
 *
 * Date-time bounds may carry an offset ("+07:00", "Z" — the guide recommends
 * sending one); a bound without one is read as hospital local time
 * (Asia/Bangkok), which is also how the extract stores every datetime.
 *
 * These sit on /api/v1, so the Bearer gate (ApiV1AuthInterceptor) covers them.
 */
@RestController
@Tag(name = "Read — case data for MedCode AI",
        description = "The nested case-object API: sync by ids or period, code catalogues, "
                + "and the pre-sync schema check")
@SecurityRequirement(name = "bearerAuth")
public class CaseSyncApiController {

    /** R2's batch cap and R3's window cap, both from the contract. */
    static final int MAX_VISIT_IDS = 20;
    static final int MAX_PERIOD_DAYS = 31;

    /** ISO 8601 date, or date-time with optional seconds, fraction and offset. */
    private static final Pattern ISO_DT = Pattern.compile(
            "^\\d{4}-\\d{2}-\\d{2}([ T]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:?\\d{2})?)?$");

    /** Hospital local time — the zone every extract datetime is stored in. */
    static final ZoneId HOSPITAL_ZONE = ZoneId.of("Asia/Bangkok");

    private static final DateTimeFormatter LOCAL_ISO =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

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

    // ---- R2 ----------------------------------------------------------------

    @PostMapping("/api/v1/cases/sync")
    @Operation(summary = "R2 — sync cases by visit ids",
            description = "Full case data for up to " + MAX_VISIT_IDS + " visit ids. Ids the "
                    + "hospital does not know come back in `not_found`; the known ones are "
                    + "still served, which is not an error for the whole request.")
    @ApiResponse(responseCode = "200", description = "cases[] + not_found[]")
    @ApiResponse(responseCode = "400", description = "invalid_request — visit_ids missing, empty, "
            + "or holding something other than non-blank strings")
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
                    + "Both ends included; `from` must not be after `to`. Send an offset "
                    + "(+07:00) — a bound without one is read as hospital local time. The visit "
                    + "date is admission_datetime when filled, else the datetime encoded in the "
                    + "transaction number. Window length is capped at " + MAX_PERIOD_DAYS
                    + " days; the guide recommends one day per call.")
    @ApiResponse(responseCode = "200", description = "cases[] — same structure as R2")
    @ApiResponse(responseCode = "400", description = "invalid_request — from/to missing, "
            + "unparseable, or from after to")
    @ApiResponse(responseCode = "422", description = "period_too_long — window longer than the cap")
    public Map<String, Object> syncByPeriod(@RequestBody(required = false) Map<String, Object> body) {
        LocalDateTime from = requiredDateTime(body, "from");
        LocalDateTime to = requiredDateTime(body, "to");
        if (from.isAfter(to)) {
            throw new ApiExceptionHandler.ImedBusinessException("from must not be after to");
        }
        if (from.plusDays(MAX_PERIOD_DAYS).isBefore(to)) {
            throw new ApiExceptionHandler.ImedUnprocessableException(
                    "period_too_long", "ช่วงวันที่ยาวเกินเพดานที่กำหนด");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cases", repo.cases(repo.visitIdsInPeriod(from.format(LOCAL_ISO), to.format(LOCAL_ISO))));
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
    @ApiResponse(responseCode = "400", description = "invalid_request — required_fields missing, "
            + "empty, or holding something other than non-blank strings")
    public Map<String, Object> contractCheck(@RequestBody(required = false) Map<String, Object> body) {
        List<String> requested = requiredStringList(body, "required_fields");
        List<String> missing = new ArrayList<>();
        for (String field : requested) {
            if (!SUPPORTED_FIELDS.contains(field) && !missing.contains(field)) {
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
     * A required ISO 8601 bound, as hospital local time. A bare date is the
     * start of that day; a bound with an offset is converted to Asia/Bangkok
     * (so "2026-08-09T17:00:00Z" means 00:00 on the 10th); one without an
     * offset is already local. Unparseable, or not a real date → 400.
     */
    static LocalDateTime requiredDateTime(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        String s = v == null ? null : v.toString().trim();
        if (s == null || s.isEmpty()) {
            throw new ApiExceptionHandler.ImedBusinessException(key + " is required");
        }
        if (!ISO_DT.matcher(s).matches()) {
            throw new ApiExceptionHandler.ImedBusinessException(
                    key + " must be ISO 8601 (2026-11-04T00:00:00+07:00)");
        }
        try {
            return toHospitalLocal(s);
        } catch (DateTimeParseException e) { // well-formed but not a real date (2026-02-30)
            throw new ApiExceptionHandler.ImedBusinessException(key + " is not a real date-time");
        }
    }

    private static LocalDateTime toHospitalLocal(String s) {
        if (s.length() == 10) {
            return LocalDate.parse(s).atStartOfDay();
        }
        String t = s.replace(' ', 'T');
        if (t.length() == 16) {
            t = t + ":00"; // HH:mm → HH:mm:ss
        } else if (t.length() > 16 && t.charAt(16) != ':') {
            t = t.substring(0, 16) + ":00" + t.substring(16); // HH:mm+07:00 → HH:mm:00+07:00
        }
        if (t.endsWith("Z") || t.matches(".*T.*[+-]\\d{2}:?\\d{2}$")) {
            // "+0700" is ISO 8601 too, but java.time wants the colon form
            t = t.replaceFirst("([+-]\\d{2})(\\d{2})$", "$1:$2");
            return OffsetDateTime.parse(t).atZoneSameInstant(HOSPITAL_ZONE).toLocalDateTime();
        }
        return LocalDateTime.parse(t);
    }

    private static List<String> requiredIdList(Map<String, Object> body) {
        return requiredStringList(body, "visit_ids");
    }

    /** A required, non-empty array of non-blank strings — the guide's rule for both lists. */
    private static List<String> requiredStringList(Map<String, Object> body, String key) {
        Object raw = body == null ? null : body.get(key);
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            throw new ApiExceptionHandler.ImedBusinessException(
                    key + " must be a non-empty array of strings");
        }
        List<String> out = new ArrayList<>();
        for (Object o : list) {
            if (!(o instanceof String str) || str.isBlank()) {
                throw new ApiExceptionHandler.ImedBusinessException(
                        key + " must hold non-blank strings only");
            }
            out.add(str);
        }
        return out;
    }
}
