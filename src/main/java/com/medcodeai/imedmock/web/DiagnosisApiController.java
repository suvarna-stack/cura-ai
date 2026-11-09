package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.repo.ImedApiV1Repository;
import com.medcodeai.imedmock.repo.ImedApiV1Repository.DiagnosisIpdFields;
import com.medcodeai.imedmock.repo.ImedCaseSyncRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
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

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Mock of the hospital's write API, validated to the Medihack API guide for
 * MedCode (4 Nov 2026) — same paths, field names, envelopes and 400 rules —
 * so medcode-api integrates against the rules it will meet on cutover day.
 *
 * ONE deliberate difference from the hospital's own mock: these writes are
 * REAL. The hospital's mock answers {@code mock: true} and stores nothing;
 * this one persists every create/update/cancel into the extract tables, so
 * the reads show them and MedCode AI's approve → reopen round trip can be
 * tested end to end. It therefore never sends {@code mock: true}.
 *
 * What the guide requires, and this class enforces:
 * - Envelope (POST and PUT): request_id is {@code MCAI-<visit_id>-<UUID v4>}
 *   naming the same visit as object_id; fix_visit_type_id is OPD|IPD;
 *   doctor_discharge is "1"; optional coding_status is approved|open.
 * - POST: diagnosis_icd10 AND diagnosis_icd9 are both present, exactly one of
 *   them has rows, the other is []. ICD-10 rows need icd10_code,
 *   fix_diagnosis_type_id (4 values), fix_dx_source "MED_DC" and coder_eid;
 *   ICD-9 rows need icd9_code, fix_operation_type_id (4 values) and is_from
 *   "MED_DC". The discharge object matching the visit type is required (IPD
 *   also needs is_from "MED_DC"). A time needs its date.
 * - PUT: object_id equals the path visit_id; send only the array being
 *   changed (no [] for the other), at least one row, each row object_id plus
 *   at least one field to change; no discharge object; ICD-9 rows never carry
 *   the create-only fix_operation_type_id. A body with no row changes must
 *   carry coding_status (the status-only PUT). time_in/time_out may come
 *   without the date, or as null.
 * - Both: a description is sent as a matching pair (icd10_description +
 *   beginning_diagnosis, icd9_description + beginning_operation), never as an
 *   empty string; dates are real YYYY-MM-DD, times HH:mm:ss; ANY field outside
 *   the guide's set is a 400.
 *
 * Kept from the hospital's earlier PDF because the real HIS will do them,
 * even though the hospital's mock does not: request_id replay returns the
 * stored response, a duplicate ICD-10 code on the visit is 409, an unknown
 * visit or row id is 400. The 409 check is per visit (the extract has no
 * doctor column; the real check is per visit + doctor).
 *
 * coding_status is stored on medhack_patient.coding_status ("open" clears
 * it) and never touches dischargestatus — that column is the doctor's
 * clinical outcome, not ours to write.
 */
@RestController
@Tag(name = "Write — diagnosis & procedure rows",
        description = "Create / edit / cancel ICD-10 and ICD-9 rows, validated to the hospital's "
                + "Medihack API guide (writes persist in this mock)")
@SecurityRequirement(name = "bearerAuth")
public class DiagnosisApiController {

    private static final Set<String> VISIT_TYPES = Set.of("OPD", "IPD");
    private static final Set<String> DX_TYPES = Set.of(
            "PRIMARY_DIAGNOSIS", "COMORBIDITY", "OTHERS", "EXTERNAL_CAUSE_OF_INJURY");
    private static final Set<String> OPERATION_TYPES = Set.of(
            "OR Procedure", "NON OR Procedure", "OTH", "GENERAL_OPERATION");
    /** "open" stores NULL (cleared). */
    private static final Set<String> CODING_STATUSES = Set.of("approved", "open");
    private static final String MED_DC = "MED_DC";

    // the guide's accepted field sets — anything else in the body is a 400
    private static final Set<String> ENVELOPE_KEYS = Set.of("request_id", "object_id",
            "fix_visit_type_id", "doctor_discharge", "coding_status", "diagnosis_icd10",
            "diagnosis_icd9", "doctor_discharge_opd", "doctor_discharge_ipd");
    private static final Set<String> ICD10_POST_KEYS = Set.of("icd10_code", "icd10_description",
            "beginning_diagnosis", "fix_diagnosis_type_id", "fix_dx_source", "coder_eid");
    private static final Set<String> ICD10_PUT_KEYS = Set.of("object_id", "icd10_code",
            "icd10_description", "beginning_diagnosis", "fix_diagnosis_type_id");
    private static final Set<String> ICD9_POST_KEYS = Set.of("icd9_code", "icd9_description",
            "beginning_operation", "fix_operation_type_id", "is_from", "date_in", "time_in",
            "date_out", "time_out");
    private static final Set<String> ICD9_PUT_KEYS = Set.of("object_id", "icd9_code",
            "icd9_description", "beginning_operation", "date_in", "time_in", "date_out", "time_out");
    private static final Set<String> OPD_KEYS = Set.of("fix_opd_discharge_status_id");
    private static final Set<String> IPD_KEYS = Set.of("fix_ipd_discharge_status_id",
            "fix_ipd_discharge_type_id", "is_from");
    /** The only row fields that may be sent as null (PUT: "clear this time"). */
    private static final Set<String> NULLABLE_ROW_KEYS = Set.of("time_in", "time_out");

    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Pattern TIME = Pattern.compile("^\\d{2}:\\d{2}:\\d{2}$");
    private static final String UUID_V4 =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";

    private final ImedCaseSyncRepository read;
    private final ImedApiV1Repository repo;
    private final JsonMapper json = new JsonMapper();

    public DiagnosisApiController(ImedCaseSyncRepository read, ImedApiV1Repository repo) {
        this.read = read;
        this.repo = repo;
    }

    // ---- POST /api/v1/diagnosis --------------------------------------------

    @PostMapping("/api/v1/diagnosis")
    @Transactional
    @Operation(summary = "Create diagnosis OR procedure rows, plus the discharge object",
            description = "Exactly one of `diagnosis_icd10` / `diagnosis_icd9` has rows; the other "
                    + "is `[]`. New rows carry no `object_id` — generated ids come back in "
                    + "`result`. `doctor_discharge` is \"1\" and the discharge object matching "
                    + "`fix_visit_type_id` is required. Optional `coding_status` "
                    + "(\"approved\" / \"open\") marks or clears the visit.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(implementation = DiagnosisRequest.class))))
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS envelope with generated object_ids")
    @ApiResponse(responseCode = "400", description = "STATUS_BUSINESS_ERROR invalid_request")
    @ApiResponse(responseCode = "401", description = "Missing, wrong or expired Bearer token")
    @ApiResponse(responseCode = "409", description = "STATUS_BUSINESS_ERROR DIAGNOSIS_CODE_ALREADY_EXIST")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> raw) {
        DiagnosisRequest req = bind(raw, true);
        validateEnvelope(req, null);

        List<DiagnosisRequest.Icd10Row> rows10 = req.diagnosis_icd10();
        List<DiagnosisRequest.Icd9Row> rows9 = req.diagnosis_icd9();
        require(rows10 != null && rows9 != null,
                "diagnosis_icd10 and diagnosis_icd9 are both required on POST (one of them [])");
        require(rows10.isEmpty() != rows9.isEmpty(),
                "exactly one of diagnosis_icd10 / diagnosis_icd9 must have rows; the other must be []");

        String tn = req.object_id();
        boolean opd = "OPD".equals(req.fix_visit_type_id());
        if (opd) {
            require(req.doctor_discharge_opd() != null, "doctor_discharge_opd is required for OPD");
            require(req.doctor_discharge_ipd() == null, "doctor_discharge_ipd must be absent for OPD");
            require(!blank(req.doctor_discharge_opd().fix_opd_discharge_status_id()),
                    "doctor_discharge_opd.fix_opd_discharge_status_id is required");
        } else {
            require(req.doctor_discharge_ipd() != null, "doctor_discharge_ipd is required for IPD");
            require(req.doctor_discharge_opd() == null, "doctor_discharge_opd must be absent for IPD");
            DiagnosisRequest.DischargeIpd d = req.doctor_discharge_ipd();
            require(!blank(d.fix_ipd_discharge_status_id()),
                    "doctor_discharge_ipd.fix_ipd_discharge_status_id is required");
            require(!blank(d.fix_ipd_discharge_type_id()),
                    "doctor_discharge_ipd.fix_ipd_discharge_type_id is required");
            require(MED_DC.equals(d.is_from()), "doctor_discharge_ipd.is_from must be \"MED_DC\"");
        }
        for (DiagnosisRequest.Icd10Row r : rows10) {
            require(!blank(r.icd10_code()), "diagnosis_icd10[].icd10_code is required");
            require(DX_TYPES.contains(r.fix_diagnosis_type_id()),
                    "diagnosis_icd10[].fix_diagnosis_type_id must be one of " + DX_TYPES);
            require(MED_DC.equals(r.fix_dx_source()), "diagnosis_icd10[].fix_dx_source must be \"MED_DC\"");
            require(!blank(r.coder_eid()), "diagnosis_icd10[].coder_eid is required");
            requirePair(r.icd10_description(), r.beginning_diagnosis(),
                    "diagnosis_icd10[].icd10_description", "beginning_diagnosis");
        }
        for (DiagnosisRequest.Icd9Row r : rows9) {
            require(!blank(r.icd9_code()), "diagnosis_icd9[].icd9_code is required");
            require(OPERATION_TYPES.contains(r.fix_operation_type_id()),
                    "diagnosis_icd9[].fix_operation_type_id must be one of " + OPERATION_TYPES);
            require(MED_DC.equals(r.is_from()), "diagnosis_icd9[].is_from must be \"MED_DC\"");
            requirePair(r.icd9_description(), r.beginning_operation(),
                    "diagnosis_icd9[].icd9_description", "beginning_operation");
            requireDateTime(r.date_in(), r.time_in(), "date_in", "time_in");
            requireDateTime(r.date_out(), r.time_out(), "date_out", "time_out");
            require(r.time_in() == null || r.date_in() != null, "time_in needs date_in on POST");
            require(r.time_out() == null || r.date_out() != null, "time_out needs date_out on POST");
        }

        String replay = repo.findLoggedResponse(req.request_id());
        if (replay != null) {
            return readBack(replay);
        }

        // 409: a code may not repeat within the request or collide with a live row
        Set<String> seenCodes = new HashSet<>();
        for (DiagnosisRequest.Icd10Row r : rows10) {
            if (!seenCodes.add(r.icd10_code()) || repo.icd10CodeExists(tn, r.icd10_code())) {
                throw new ApiExceptionHandler.DuplicateDiagnosisException();
            }
        }

        String encountertype = opd ? "0" : "1";
        List<Map<String, Object>> out10 = new ArrayList<>();
        for (DiagnosisRequest.Icd10Row r : rows10) {
            String id = newId("DX10-");
            repo.insertIcd10(tn, encountertype, id, name(r.beginning_diagnosis(), r.icd10_description()),
                    r.icd10_code(), r.fix_diagnosis_type_id());
            out10.add(pair(id, "icd10_code", r.icd10_code()));
        }
        List<Map<String, Object>> out9 = new ArrayList<>();
        for (DiagnosisRequest.Icd9Row r : rows9) {
            String id = newId("DX9-");
            repo.insertIcd9(tn, encountertype, id, name(r.beginning_operation(), r.icd9_description()),
                    r.icd9_code(), ts(r.date_in(), r.time_in()), ts(r.date_out(), r.time_out()),
                    r.fix_operation_type_id());
            out9.add(pair(id, "icd9_code", r.icd9_code()));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("object_id", tn);
        result.put("diagnosis_icd10", out10);
        result.put("diagnosis_icd9", out9);
        if (opd) {
            String id = newId("DCO-");
            repo.upsertDischargeOpd(id, tn, req.doctor_discharge_opd().fix_opd_discharge_status_id(),
                    null, null);
            result.put("doctor_discharge_opd", Map.of("object_id", id));
        } else {
            DiagnosisRequest.DischargeIpd d = req.doctor_discharge_ipd();
            String id = newId("DCI-");
            repo.upsertDischargeIpd(id, tn, new DiagnosisIpdFields(null, d.fix_ipd_discharge_status_id(),
                    d.fix_ipd_discharge_type_id(), null, null, null, null, null, null, null, null,
                    null, null, d.is_from()));
            result.put("doctor_discharge_ipd", Map.of("object_id", id));
        }
        applyCodingStatus(req, tn, result);

        return envelope(req.request_id(), result, "POST /api/v1/diagnosis");
    }

    // ---- PUT /api/v1/diagnosis/{visit_id} ----------------------------------

    @PutMapping("/api/v1/diagnosis/{visit_id}")
    @Transactional
    @Operation(summary = "Edit existing rows, or only the coding status",
            description = "Send only the array being changed (never `[]` for the other); each row "
                    + "is `object_id` plus the fields to change. ICD-9 rows may send "
                    + "`time_in`/`time_out` without the date, or as null. A body with no rows must "
                    + "carry `coding_status` — the status-only update.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(implementation = DiagnosisRequest.class))))
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS envelope with the edited object_ids")
    @ApiResponse(responseCode = "400", description = "STATUS_BUSINESS_ERROR invalid_request")
    @ApiResponse(responseCode = "401", description = "Missing, wrong or expired Bearer token")
    public Map<String, Object> update(@PathVariable("visit_id") String visitId,
            @RequestBody(required = false) Map<String, Object> raw) {
        DiagnosisRequest req = bind(raw, false);
        validateEnvelope(req, visitId);
        require(req.doctor_discharge_opd() == null && req.doctor_discharge_ipd() == null,
                "PUT carries no discharge object");

        List<DiagnosisRequest.Icd10Row> rows10 = req.diagnosis_icd10();
        List<DiagnosisRequest.Icd9Row> rows9 = req.diagnosis_icd9();
        require(rows10 == null || !rows10.isEmpty(),
                "diagnosis_icd10 must have at least one row when sent — omit the key otherwise");
        require(rows9 == null || !rows9.isEmpty(),
                "diagnosis_icd9 must have at least one row when sent — omit the key otherwise");
        require(rows10 != null || rows9 != null || !blank(req.coding_status()),
                "nothing to update: send a row change or coding_status");

        List<Map<String, Object>> raw10 = rawRows(raw, "diagnosis_icd10");
        List<Map<String, Object>> raw9 = rawRows(raw, "diagnosis_icd9");
        for (int i = 0; rows10 != null && i < rows10.size(); i++) {
            DiagnosisRequest.Icd10Row r = rows10.get(i);
            require(!blank(r.object_id()), "diagnosis_icd10[].object_id is required on PUT");
            require(raw10.get(i).size() > 1, "diagnosis_icd10[] row " + r.object_id()
                    + " has nothing to change besides its object_id");
            require(r.fix_diagnosis_type_id() == null || DX_TYPES.contains(r.fix_diagnosis_type_id()),
                    "diagnosis_icd10[].fix_diagnosis_type_id must be one of " + DX_TYPES);
            requirePair(r.icd10_description(), r.beginning_diagnosis(),
                    "diagnosis_icd10[].icd10_description", "beginning_diagnosis");
        }
        for (int i = 0; rows9 != null && i < rows9.size(); i++) {
            DiagnosisRequest.Icd9Row r = rows9.get(i);
            require(!blank(r.object_id()), "diagnosis_icd9[].object_id is required on PUT");
            require(raw9.get(i).size() > 1, "diagnosis_icd9[] row " + r.object_id()
                    + " has nothing to change besides its object_id");
            requirePair(r.icd9_description(), r.beginning_operation(),
                    "diagnosis_icd9[].icd9_description", "beginning_operation");
            requireDateTime(r.date_in(), r.time_in(), "date_in", "time_in");
            requireDateTime(r.date_out(), r.time_out(), "date_out", "time_out");
        }

        String replay = repo.findLoggedResponse(req.request_id());
        if (replay != null) {
            return readBack(replay);
        }
        String tn = req.object_id();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("object_id", tn);
        if (rows10 != null) {
            List<Map<String, Object>> out10 = new ArrayList<>();
            for (DiagnosisRequest.Icd10Row r : rows10) {
                int n = repo.updateIcd10(tn, r.object_id(),
                        name(r.beginning_diagnosis(), r.icd10_description()), r.icd10_code(),
                        r.fix_diagnosis_type_id());
                require(n > 0, "unknown diagnosis_icd10 object_id " + r.object_id());
                out10.add(pair(r.object_id(), "icd10_code", r.icd10_code()));
            }
            result.put("diagnosis_icd10", out10);
        }
        if (rows9 != null) {
            List<Map<String, Object>> out9 = new ArrayList<>();
            for (int i = 0; i < rows9.size(); i++) {
                DiagnosisRequest.Icd9Row r = rows9.get(i);
                String[] stored = repo.procedureWindow(tn, r.object_id());
                require(stored != null, "unknown diagnosis_icd9 object_id " + r.object_id());
                Map<String, Object> rawRow = raw9.get(i);
                String start = windowValue(r.date_in(), r.time_in(), rawRow.containsKey("time_in"),
                        stored[0], "time_in");
                String end = windowValue(r.date_out(), r.time_out(), rawRow.containsKey("time_out"),
                        stored[1], "time_out");
                repo.updateIcd9(tn, r.object_id(), name(r.beginning_operation(), r.icd9_description()),
                        r.icd9_code(), start, end, null);
                out9.add(pair(r.object_id(), "icd9_code", r.icd9_code()));
            }
            result.put("diagnosis_icd9", out9);
        }
        applyCodingStatus(req, tn, result);

        return envelope(req.request_id(), result, "PUT /api/v1/diagnosis/" + visitId);
    }

    // ---- DELETE /api/v1/diagnosis/{visit_id}/icd10|icd9/{object_id} --------

    @DeleteMapping("/api/v1/diagnosis/{visit_id}/icd10/{diagnosis_icd10_id}")
    @Transactional
    @Operation(summary = "Cancel one ICD-10 diagnosis",
            description = "No body. The row is flagged cancelled (audit trail kept), never "
                    + "hard-deleted, and disappears from the reads. Idempotent.")
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS with cancelled: true")
    @ApiResponse(responseCode = "400", description = "Unknown visit or object_id")
    @ApiResponse(responseCode = "401", description = "Missing, wrong or expired Bearer token")
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
            description = "Same cancel flow as ICD-10: no body, flagged, gone from reads. Idempotent.")
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS with cancelled: true")
    @ApiResponse(responseCode = "400", description = "Unknown visit or object_id")
    @ApiResponse(responseCode = "401", description = "Missing, wrong or expired Bearer token")
    public Map<String, Object> cancelIcd9(@PathVariable("visit_id") String visitId,
            @PathVariable("diagnosis_icd9_id") String objectId) {
        requireVisit(visitId);
        require(repo.cancelIcd9(visitId, objectId) > 0,
                "unknown diagnosis_icd9 object_id " + objectId);
        return cancelEnvelope(visitId, objectId);
    }

    // ---- binding: the guide's field set, checked on the raw body -----------

    /**
     * Rejects any key outside the guide's set (per level, POST vs PUT), any
     * row value that is not a non-blank string (only time_in/time_out may be
     * null), then binds the record. Checked on the raw map because a bound
     * record cannot tell "absent" from "null" and silently drops unknown keys.
     */
    private DiagnosisRequest bind(Map<String, Object> raw, boolean post) {
        require(raw != null, "request body is required");
        requireKeys(raw, ENVELOPE_KEYS, "");
        for (Map<String, Object> row : rawRows(raw, "diagnosis_icd10")) {
            if (post) {
                require(!row.containsKey("object_id"), "diagnosis_icd10[].object_id must be empty on POST");
            }
            requireKeys(row, post ? ICD10_POST_KEYS : ICD10_PUT_KEYS, "diagnosis_icd10[].");
            requireStringValues(row, "diagnosis_icd10[].");
        }
        for (Map<String, Object> row : rawRows(raw, "diagnosis_icd9")) {
            if (post) {
                require(!row.containsKey("object_id"), "diagnosis_icd9[].object_id must be empty on POST");
            }
            requireKeys(row, post ? ICD9_POST_KEYS : ICD9_PUT_KEYS, "diagnosis_icd9[].");
            requireStringValues(row, "diagnosis_icd9[].");
        }
        if (raw.get("doctor_discharge_opd") instanceof Map<?, ?> m) {
            requireKeys(cast(m), OPD_KEYS, "doctor_discharge_opd.");
        }
        if (raw.get("doctor_discharge_ipd") instanceof Map<?, ?> m) {
            requireKeys(cast(m), IPD_KEYS, "doctor_discharge_ipd.");
        }
        try {
            return json.convertValue(raw, DiagnosisRequest.class);
        } catch (RuntimeException e) { // a list where an object belongs, etc.
            throw new ApiExceptionHandler.ImedBusinessException("body does not match the request shape");
        }
    }

    /** The raw row maps of one array, in order; [] when absent. Non-object rows are a 400. */
    private static List<Map<String, Object>> rawRows(Map<String, Object> raw, String key) {
        Object v = raw == null ? null : raw.get(key);
        if (v == null) {
            return List.of();
        }
        require(v instanceof List<?>, key + " must be an array");
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object o : (List<?>) v) {
            require(o instanceof Map<?, ?>, key + "[] rows must be objects");
            rows.add(cast((Map<?, ?>) o));
        }
        return rows;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> cast(Map<?, ?> m) {
        return (Map<String, Object>) m;
    }

    private static void requireKeys(Map<String, Object> m, Set<String> allowed, String where) {
        for (String k : m.keySet()) {
            require(allowed.contains(k), where + k + " is not accepted here");
        }
    }

    private static void requireStringValues(Map<String, Object> row, String where) {
        for (Map.Entry<String, Object> e : row.entrySet()) {
            Object v = e.getValue();
            if (v == null && NULLABLE_ROW_KEYS.contains(e.getKey())) {
                continue;
            }
            require(v instanceof String s && !s.isBlank(),
                    where + e.getKey() + " must be a non-blank string (omit the key instead)");
        }
    }

    // ---- shared validation & envelope helpers -------------------------------

    /** Rules common to POST and PUT; pathVisitId is null for POST. */
    private void validateEnvelope(DiagnosisRequest req, String pathVisitId) {
        require(!blank(req.object_id()), "object_id (visit_id) is required");
        if (pathVisitId != null) {
            require(pathVisitId.equals(req.object_id()), "object_id must equal the path visit_id");
        }
        require(!blank(req.request_id()), "request_id is required");
        require(Pattern.matches("MCAI-" + Pattern.quote(req.object_id()) + "-" + UUID_V4,
                        req.request_id()),
                "request_id must be MCAI-<visit_id>-<UUID v4> for this visit");
        require(VISIT_TYPES.contains(req.fix_visit_type_id()), "fix_visit_type_id must be OPD or IPD");
        require("1".equals(req.doctor_discharge()), "doctor_discharge must be \"1\"");
        require(req.coding_status() == null || CODING_STATUSES.contains(req.coding_status()),
                "coding_status must be one of " + CODING_STATUSES);
        requireVisit(req.object_id());
    }

    /** A description travels as a pair with identical text, or not at all. */
    private static void requirePair(String description, String beginning, String descKey, String beginKey) {
        if (description == null && beginning == null) {
            return;
        }
        require(description != null && beginning != null && description.equals(beginning),
                descKey + " and " + beginKey + " must be sent together with the same text");
    }

    /** A sent date is a real YYYY-MM-DD; a sent time is a real HH:mm:ss. */
    private static void requireDateTime(String date, String time, String dateKey, String timeKey) {
        if (date != null) {
            boolean ok = DATE.matcher(date).matches();
            if (ok) {
                try {
                    LocalDate.parse(date);
                } catch (DateTimeParseException e) {
                    ok = false;
                }
            }
            require(ok, "diagnosis_icd9[]." + dateKey + " must be a real YYYY-MM-DD date");
        }
        if (time != null) {
            boolean ok = TIME.matcher(time).matches();
            if (ok) {
                try {
                    LocalTime.parse(time);
                } catch (DateTimeParseException e) {
                    ok = false;
                }
            }
            require(ok, "diagnosis_icd9[]." + timeKey + " must be HH:mm:ss");
        }
    }

    /**
     * The new stored start/end for a PUT row, or null for "unchanged". A sent
     * date replaces the whole value (with the sent time, if any). A time sent
     * WITHOUT its date — allowed by the guide — lands on the date already
     * stored; null as the time clears the time and keeps the date.
     */
    private static String windowValue(String date, String time, boolean timeSent, String stored,
            String timeKey) {
        if (date != null) {
            return ts(date, time);
        }
        if (!timeSent) {
            return null;
        }
        require(stored != null && stored.length() >= 10,
                timeKey + " needs a date: the procedure has none stored, so send the date too");
        return ts(stored.substring(0, 10), time);
    }

    /**
     * absent changes nothing, "approved" marks the visit coded, "open" clears
     * the mark (reopen). Echoed in the result as sent, as the guide shows.
     */
    private void applyCodingStatus(DiagnosisRequest req, String tn, Map<String, Object> result) {
        String s = req.coding_status();
        if (s == null) {
            return;
        }
        repo.updateCodingStatus(tn, "open".equals(s) ? null : s);
        result.put("coding_status", s);
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

    /** {object_id, code} — the code only when the request sent one, as the guide shows. */
    private static Map<String, Object> pair(String objectId, String codeKey, String code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("object_id", objectId);
        if (code != null) {
            m.put(codeKey, code);
        }
        return m;
    }

    /** Display name for the extract's `name` column (the pair carries one text). */
    private static String name(String beginning, String description) {
        return beginning != null ? beginning : description;
    }

    /** "YYYY-MM-DD" + "HH:mm:ss" → extract-style datetime text, null-tolerant. */
    private static String ts(String date, String time) {
        if (blank(date)) {
            return null;
        }
        return blank(time) ? date : date + " " + time;
    }

    private static String newId(String prefix) {
        return prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
