package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.repo.ImedApiV1Repository;
import com.medcodeai.imedmock.repo.ImedApiV1Repository.DiagnosisIpdFields;
import com.medcodeai.imedmock.repo.ImedReadRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Mock of the REAL hospital write API — "iMed Diagnosis and Medical Discharge
 * API" (rev 1, 24 Jul 2026), which supersedes the invented coding-result
 * contract. Same paths (/api/v1/diagnosis…), field names, response envelope
 * ({request_id, status, result}), and error semantics (400 business error,
 * 401 via ApiV1AuthInterceptor, 409 DIAGNOSIS_CODE_ALREADY_EXIST) — so
 * medcode-api integrates against reality and production is an IMED_API_BASE
 * + token swap.
 *
 * Semantics per the PDF:
 * - POST creates ICD-10/ICD-9 rows + medical discharge in ONE transaction;
 *   new rows must NOT carry object_id — iMed generates and returns them.
 * - PUT edits rows by the object_id returned from POST.
 * - DELETE cancels one dx/procedure via the cancel flow (is_cancelled flag,
 *   audit trail — never a hard delete; not applicable to discharge data).
 * - request_id: replays return the stored response instead of re-executing.
 *
 * Mock-only strictness (documented divergences, all safe for the real swap):
 * - PUT rows without object_id are REJECTED with detail, where the real API
 *   silently ignores them — loud beats silent while we debug medcode-api.
 * - Master data stands in for the hospital's: fix_visit_type_id is OPD|IPD,
 *   fix_diagnosis_type_id is the extract's diagnosistype vocabulary
 *   (PRIMARY_DIAGNOSIS / COMORBIDITY / OTHERS / EXTERNAL_CAUSE_OF_INJURY),
 *   fix_operation_type_id is any non-blank string. Real IDs arrive with the
 *   hospital's master-data list and slot into the same fields.
 * - The 409 duplicate check is per visit (the extract has no doctor column;
 *   the real check is per visit+doctor).
 */
@RestController
@Tag(name = "Write v1 — iMed diagnosis & medical discharge",
        description = "The hospital's real write contract, mocked field-for-field from their API PDF")
@SecurityRequirement(name = "bearerAuth")
public class DiagnosisApiController {

    private static final Set<String> VISIT_TYPES = Set.of("OPD", "IPD");
    private static final Set<String> DX_TYPES = Set.of(
            "PRIMARY_DIAGNOSIS", "COMORBIDITY", "OTHERS", "EXTERNAL_CAUSE_OF_INJURY");

    private final ImedReadRepository read;
    private final ImedApiV1Repository repo;
    private final JsonMapper json = new JsonMapper();

    public DiagnosisApiController(ImedReadRepository read, ImedApiV1Repository repo) {
        this.read = read;
        this.repo = repo;
    }

    // ---- POST /api/v1/diagnosis --------------------------------------------

    @PostMapping("/api/v1/diagnosis")
    @Transactional
    @Operation(summary = "Create diagnoses, procedures and medical discharge (one transaction)",
            description = "New rows must not carry `object_id` — generated ids come back in "
                    + "`result`, and the caller must keep them for later PUT/DELETE. "
                    + "`doctor_discharge` must be \"1\"; the discharge object matching "
                    + "`fix_visit_type_id` (OPD/IPD) is required. Replaying the same "
                    + "`request_id` returns the stored response without re-executing.")
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS envelope with generated object_ids")
    @ApiResponse(responseCode = "400", description = "STATUS_BUSINESS_ERROR invalid_request")
    @ApiResponse(responseCode = "401", description = "Missing/wrong Bearer token")
    @ApiResponse(responseCode = "409", description = "STATUS_BUSINESS_ERROR DIAGNOSIS_CODE_ALREADY_EXIST")
    public Map<String, Object> create(@RequestBody DiagnosisRequest req) {
        validateCommon(req, null);

        String replay = repo.findLoggedResponse(req.request_id());
        if (replay != null) {
            return readBack(replay);
        }

        String tn = req.object_id();
        String encountertype = "OPD".equals(req.fix_visit_type_id()) ? "0" : "1";

        // every new row must be object_id-less; codes must not collide (409)
        Set<String> seenCodes = new HashSet<>();
        for (DiagnosisRequest.Icd10Row r : icd10(req)) {
            require(blank(r.object_id()), "diagnosis_icd10[].object_id must be empty on POST");
            require(!blank(r.icd10_code()), "diagnosis_icd10[].icd10_code is required");
            require(!blank(r.fix_diagnosis_type_id()) && DX_TYPES.contains(r.fix_diagnosis_type_id()),
                    "diagnosis_icd10[].fix_diagnosis_type_id must be one of " + DX_TYPES);
            if ("1".equals(r.is_personal_illness())) {
                require(!blank(r.patient_id()), "patient_id is required when is_personal_illness is \"1\"");
            }
            if (!seenCodes.add(r.icd10_code()) || repo.icd10CodeExists(tn, r.icd10_code())) {
                throw new ApiExceptionHandler.DuplicateDiagnosisException();
            }
        }
        for (DiagnosisRequest.Icd9Row r : icd9(req)) {
            require(blank(r.object_id()), "diagnosis_icd9[].object_id must be empty on POST");
            require(!blank(r.fix_operation_type_id()), "diagnosis_icd9[].fix_operation_type_id is required");
            require(!blank(r.icd9_code()) || !blank(r.beginning_operation()),
                    "diagnosis_icd9[] needs icd9_code or beginning_operation");
        }

        // writes + envelope in table order: icd10, icd9, discharge
        List<Map<String, Object>> outIcd10 = new ArrayList<>();
        for (DiagnosisRequest.Icd10Row r : icd10(req)) {
            String id = newId("DX10-");
            repo.insertIcd10(tn, encountertype, id, name10(r), r.icd10_code(), r.fix_diagnosis_type_id());
            outIcd10.add(pair(id, "icd10_code", r.icd10_code()));
        }
        List<Map<String, Object>> outIcd9 = new ArrayList<>();
        for (DiagnosisRequest.Icd9Row r : icd9(req)) {
            String id = newId("DX9-");
            repo.insertIcd9(tn, encountertype, id, name9(r), r.icd9_code(),
                    ts(r.date_in(), r.time_in()), ts(r.date_out(), r.time_out()),
                    r.fix_operation_type_id());
            outIcd9.add(pair(id, "icd9_code", r.icd9_code()));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("object_id", tn);
        result.put("diagnosis_icd10", outIcd10);
        result.put("diagnosis_icd9", outIcd9);
        if ("OPD".equals(req.fix_visit_type_id())) {
            DiagnosisRequest.DischargeOpd d = req.doctor_discharge_opd();
            require(blank(d.object_id()), "doctor_discharge_opd.object_id must be empty on POST");
            require(!blank(d.fix_opd_discharge_status_id()),
                    "doctor_discharge_opd.fix_opd_discharge_status_id is required");
            String id = newId("DCO-");
            repo.upsertDischargeOpd(id, tn, d.fix_opd_discharge_status_id(),
                    d.base_doctor_discharge_type_id(), d.note());
            result.put("doctor_discharge_opd", Map.of("object_id", id));
        } else {
            DiagnosisRequest.DischargeIpd d = req.doctor_discharge_ipd();
            require(blank(d.object_id()), "doctor_discharge_ipd.object_id must be empty on POST");
            require(!blank(d.fix_ipd_discharge_status_id()),
                    "doctor_discharge_ipd.fix_ipd_discharge_status_id is required");
            require(!blank(d.fix_ipd_discharge_type_id()),
                    "doctor_discharge_ipd.fix_ipd_discharge_type_id is required");
            String id = newId("DCI-");
            repo.upsertDischargeIpd(id, tn, ipdFields(d));
            result.put("doctor_discharge_ipd", Map.of("object_id", id));
        }

        return envelope(req.request_id(), result, "POST /api/v1/diagnosis");
    }

    // ---- PUT /api/v1/diagnosis/{visit_id} ----------------------------------

    @PutMapping("/api/v1/diagnosis/{visit_id}")
    @Transactional
    @Operation(summary = "Edit existing diagnoses, procedures or discharge data",
            description = "Every edited object must carry the `object_id` returned by POST — rows "
                    + "without one are rejected (the real API silently ignores them; the mock is "
                    + "deliberately louder). Only provided fields are changed.")
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS envelope with the edited object_ids")
    @ApiResponse(responseCode = "400", description = "STATUS_BUSINESS_ERROR invalid_request")
    @ApiResponse(responseCode = "401", description = "Missing/wrong Bearer token")
    @ApiResponse(responseCode = "409", description = "STATUS_BUSINESS_ERROR DIAGNOSIS_CODE_ALREADY_EXIST")
    public Map<String, Object> update(@PathVariable("visit_id") String visitId,
            @RequestBody DiagnosisRequest req) {
        validateCommon(req, visitId);

        String replay = repo.findLoggedResponse(req.request_id());
        if (replay != null) {
            return readBack(replay);
        }
        String tn = req.object_id();

        List<Map<String, Object>> outIcd10 = new ArrayList<>();
        for (DiagnosisRequest.Icd10Row r : icd10(req)) {
            require(!blank(r.object_id()),
                    "diagnosis_icd10[].object_id is required on PUT (PUT never creates rows)");
            if (r.fix_diagnosis_type_id() != null) {
                require(DX_TYPES.contains(r.fix_diagnosis_type_id()),
                        "diagnosis_icd10[].fix_diagnosis_type_id must be one of " + DX_TYPES);
            }
            int n = repo.updateIcd10(tn, r.object_id(), name10(r), r.icd10_code(),
                    r.fix_diagnosis_type_id());
            require(n > 0, "unknown diagnosis_icd10 object_id " + r.object_id());
            outIcd10.add(pair(r.object_id(), "icd10_code", r.icd10_code()));
        }
        List<Map<String, Object>> outIcd9 = new ArrayList<>();
        for (DiagnosisRequest.Icd9Row r : icd9(req)) {
            require(!blank(r.object_id()),
                    "diagnosis_icd9[].object_id is required on PUT (PUT never creates rows)");
            int n = repo.updateIcd9(tn, r.object_id(), name9(r), r.icd9_code(),
                    ts(r.date_in(), r.time_in()), ts(r.date_out(), r.time_out()),
                    r.fix_operation_type_id());
            require(n > 0, "unknown diagnosis_icd9 object_id " + r.object_id());
            outIcd9.add(pair(r.object_id(), "icd9_code", r.icd9_code()));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("object_id", tn);
        result.put("diagnosis_icd10", outIcd10);
        result.put("diagnosis_icd9", outIcd9);
        if (req.doctor_discharge_opd() != null) {
            DiagnosisRequest.DischargeOpd d = req.doctor_discharge_opd();
            require(!blank(d.object_id()), "doctor_discharge_opd.object_id is required on PUT");
            int n = repo.updateDischargeOpd(tn, d.object_id(), d.fix_opd_discharge_status_id(),
                    d.base_doctor_discharge_type_id(), d.note());
            require(n > 0, "unknown doctor_discharge_opd object_id " + d.object_id());
            result.put("doctor_discharge_opd", Map.of("object_id", d.object_id()));
        }
        if (req.doctor_discharge_ipd() != null) {
            DiagnosisRequest.DischargeIpd d = req.doctor_discharge_ipd();
            require(!blank(d.object_id()), "doctor_discharge_ipd.object_id is required on PUT");
            int n = repo.updateDischargeIpd(tn, d.object_id(), ipdFields(d));
            require(n > 0, "unknown doctor_discharge_ipd object_id " + d.object_id());
            result.put("doctor_discharge_ipd", Map.of("object_id", d.object_id()));
        }

        return envelope(req.request_id(), result, "PUT /api/v1/diagnosis/" + visitId);
    }

    // ---- DELETE /api/v1/diagnosis/{visit_id}/icd10|icd9/{object_id} --------

    @DeleteMapping("/api/v1/diagnosis/{visit_id}/icd10/{diagnosis_icd10_id}")
    @Transactional
    @Operation(summary = "Cancel one ICD-10 diagnosis",
            description = "iMed's cancel flow: the row is flagged cancelled (audit trail preserved), "
                    + "never hard-deleted, and disappears from the extract READ endpoints. Idempotent.")
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS with cancelled: true")
    @ApiResponse(responseCode = "400", description = "Unknown visit or object_id")
    @ApiResponse(responseCode = "401", description = "Missing/wrong Bearer token")
    public Map<String, Object> cancelIcd10(@PathVariable("visit_id") String visitId,
            @PathVariable("diagnosis_icd10_id") String objectId) {
        requireVisit(visitId);
        require(repo.cancelIcd10(visitId, objectId) > 0,
                "unknown diagnosis_icd10 object_id " + objectId);
        return cancelEnvelope(visitId, objectId);
    }

    @DeleteMapping("/api/v1/diagnosis/{visit_id}/icd9/{diagnosis_icd9_id}")
    @Transactional
    @Operation(summary = "Cancel one ICD-9 procedure",
            description = "Same cancel flow as ICD-10: flagged, audit-trailed, gone from reads. Idempotent.")
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS with cancelled: true")
    @ApiResponse(responseCode = "400", description = "Unknown visit or object_id")
    @ApiResponse(responseCode = "401", description = "Missing/wrong Bearer token")
    public Map<String, Object> cancelIcd9(@PathVariable("visit_id") String visitId,
            @PathVariable("diagnosis_icd9_id") String objectId) {
        requireVisit(visitId);
        require(repo.cancelIcd9(visitId, objectId) > 0,
                "unknown diagnosis_icd9 object_id " + objectId);
        return cancelEnvelope(visitId, objectId);
    }

    // ---- shared validation & envelope helpers -------------------------------

    /** Rules common to POST and PUT; pathVisitId is null for POST. */
    private void validateCommon(DiagnosisRequest req, String pathVisitId) {
        require(req != null, "request body is required");
        require(!blank(req.request_id()), "request_id is required");
        require(!blank(req.object_id()), "object_id (visit_id) is required");
        if (pathVisitId != null) {
            require(pathVisitId.equals(req.object_id()), "object_id must equal the path visit_id");
        }
        require(!blank(req.fix_visit_type_id()) && VISIT_TYPES.contains(req.fix_visit_type_id()),
                "fix_visit_type_id must be OPD or IPD (mock master data)");
        require("1".equals(req.doctor_discharge()), "doctor_discharge must be \"1\"");
        requireVisit(req.object_id());
        if (pathVisitId == null) { // POST: exactly the matching discharge object
            if ("OPD".equals(req.fix_visit_type_id())) {
                require(req.doctor_discharge_opd() != null, "doctor_discharge_opd is required for OPD");
                require(req.doctor_discharge_ipd() == null, "doctor_discharge_ipd must be absent for OPD");
            } else {
                require(req.doctor_discharge_ipd() != null, "doctor_discharge_ipd is required for IPD");
                require(req.doctor_discharge_opd() == null, "doctor_discharge_opd must be absent for IPD");
            }
        }
    }

    private void requireVisit(String tn) {
        require(read.caseExists(tn), "unknown visit_id " + tn);
    }

    private static void require(boolean ok, String detail) {
        if (!ok) {
            throw new ApiExceptionHandler.ImedBusinessException(detail);
        }
    }

    /** Serializes, logs under request_id, and returns the success envelope. */
    private Map<String, Object> envelope(String requestId, Map<String, Object> result, String endpoint) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("request_id", requestId);
        out.put("status", "STATUS_SUCCESS");
        out.put("result", result);
        repo.logRequest(requestId, endpoint, json.writeValueAsString(out));
        return out;
    }

    private Map<String, Object> cancelEnvelope(String visitId, String objectId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("visit_id", visitId);
        result.put("object_id", objectId);
        result.put("cancelled", true);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "STATUS_SUCCESS");
        out.put("result", result);
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readBack(String storedJson) {
        return json.readValue(storedJson, LinkedHashMap.class);
    }

    private static Map<String, Object> pair(String objectId, String codeKey, String code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("object_id", objectId);
        if (code != null) {
            m.put(codeKey, code);
        }
        return m;
    }

    private static List<DiagnosisRequest.Icd10Row> icd10(DiagnosisRequest req) {
        return req.diagnosis_icd10() == null ? List.of() : req.diagnosis_icd10();
    }

    private static List<DiagnosisRequest.Icd9Row> icd9(DiagnosisRequest req) {
        return req.diagnosis_icd9() == null ? List.of() : req.diagnosis_icd9();
    }

    /** Display name for the extract's `name` column: English name, else description. */
    private static String name10(DiagnosisRequest.Icd10Row r) {
        return r.beginning_diagnosis() != null ? r.beginning_diagnosis() : r.icd10_description();
    }

    private static String name9(DiagnosisRequest.Icd9Row r) {
        return r.beginning_operation() != null ? r.beginning_operation() : r.icd9_description();
    }

    /** "YYYY-MM-DD" + "HH:mm:ss" → extract-style datetime text, null-tolerant. */
    private static String ts(String date, String time) {
        if (blank(date)) {
            return null;
        }
        return blank(time) ? date : date + " " + time;
    }

    private static DiagnosisIpdFields ipdFields(DiagnosisRequest.DischargeIpd d) {
        return new DiagnosisIpdFields(d.discharge_doctor_eid(), d.fix_ipd_discharge_status_id(),
                d.fix_ipd_discharge_type_id(), d.note(), d.reason_admission(),
                d.physical_examination(), d.diagnostic(), d.investigation(), d.hospital_course(),
                d.treatment(), d.plan_or_advice(), d.discharge_instruction(), d.is_follow_up(),
                d.is_from());
    }

    private static String newId(String prefix) {
        return prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
