package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.repo.ImedApiV1Repository;
import com.medcodeai.imedmock.repo.ImedReadRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * OUR proposed coding-status mini-contract — the piece missing from the
 * hospital's diagnosis/discharge PDF. The hospital agreed to add a
 * coding-status table on their side; this endpoint pair is the write shape we
 * propose for it, styled exactly like their API (Bearer auth, snake_case,
 * request_id dedup, {request_id, status, result} envelope) so it reads as a
 * natural extension of their contract. Reads stay on the extract endpoint
 * GET /api/cases/{tn}/coding-status.
 *
 * PUT upserts (idempotent), DELETE clears on reopen (idempotent, no
 * request_id — mirrors their DELETE being path-only).
 */
@RestController
@Tag(name = "Write v1 — coding status (proposed)",
        description = "MedCode AI's proposed extension: the coding-status write the hospital "
                + "will back with a new table")
@SecurityRequirement(name = "bearerAuth")
public class CodingStatusController {

    private final ImedReadRepository read;
    private final ImedApiV1Repository repo;
    private final JsonMapper json = new JsonMapper();

    public CodingStatusController(ImedReadRepository read, ImedApiV1Repository repo) {
        this.read = read;
        this.repo = repo;
    }

    @PutMapping("/api/v1/coding-status/{visit_id}")
    @Transactional
    @Operation(summary = "Set the case's coding status (approve flow)",
            description = "Upserts the coding-status row for the visit. Idempotent; replaying the "
                    + "same request_id returns the stored response.")
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS")
    @ApiResponse(responseCode = "400", description = "STATUS_BUSINESS_ERROR invalid_request")
    @ApiResponse(responseCode = "401", description = "Missing/wrong Bearer token")
    public Map<String, Object> put(@PathVariable("visit_id") String visitId,
            @RequestBody CodingStatusRequest req) {
        require(req != null && !blank(req.request_id()), "request_id is required");
        require(!blank(req.coding_status()), "coding_status is required");
        require(read.caseExists(visitId), "unknown visit_id " + visitId);

        String replay = repo.findLoggedResponse(req.request_id());
        if (replay != null) {
            return readBack(replay);
        }
        repo.upsertCodingStatus(visitId, req.coding_status(), req.finalized_at(), req.updated_by());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("visit_id", visitId);
        result.put("coding_status", req.coding_status());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("request_id", req.request_id());
        out.put("status", "STATUS_SUCCESS");
        out.put("result", result);
        repo.logRequest(req.request_id(), "PUT /api/v1/coding-status/" + visitId,
                json.writeValueAsString(out));
        return out;
    }

    @DeleteMapping("/api/v1/coding-status/{visit_id}")
    @Transactional
    @Operation(summary = "Clear the case's coding status (reopen flow)",
            description = "Removes the coding-status row. Idempotent — clearing an uncoded case "
                    + "still answers cleared: true.")
    @ApiResponse(responseCode = "200", description = "STATUS_SUCCESS with cleared: true")
    @ApiResponse(responseCode = "400", description = "Unknown visit")
    @ApiResponse(responseCode = "401", description = "Missing/wrong Bearer token")
    public Map<String, Object> delete(@PathVariable("visit_id") String visitId) {
        require(read.caseExists(visitId), "unknown visit_id " + visitId);
        repo.deleteCodingStatus(visitId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("visit_id", visitId);
        result.put("cleared", true);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "STATUS_SUCCESS");
        out.put("result", result);
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readBack(String storedJson) {
        return json.readValue(storedJson, LinkedHashMap.class);
    }

    private static void require(boolean ok, String detail) {
        if (!ok) {
            throw new ApiExceptionHandler.ImedBusinessException(detail);
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
