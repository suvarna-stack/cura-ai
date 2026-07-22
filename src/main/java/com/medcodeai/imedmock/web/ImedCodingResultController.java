package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.repo.ImedReadRepository;
import com.medcodeai.imedmock.repo.ImedWritebackRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * WRITE direction of the hospital API — "receive MedCode AI's approval
 * results". On finalization exactly two things are written (Simulation Model
 * doc Part C): the A11 coding-status row and the finalized ICD codes as NEW
 * rows whose id carries the 'MCAI-' prefix (the marker distinguishing
 * MedCode AI codes from hospital originals — enforced here). Clinical notes
 * are never touched.
 *
 * PUT replaces any previously submitted result for the case (idempotent);
 * DELETE clears it (reopen). Both run in one local transaction.
 */
@RestController
@Tag(name = "Write — receive our approval results",
        description = "The limited write-back MedCode AI performs on case finalization")
public class ImedCodingResultController {

    private final ImedReadRepository read;
    private final ImedWritebackRepository write;

    public ImedCodingResultController(ImedReadRepository read, ImedWritebackRepository write) {
        this.read = read;
        this.write = write;
    }

    @PutMapping("/api/cases/{tn}/coding-result")
    @Transactional
    @Operation(summary = "Submit the approval result for a case",
            description = "Writes the A11 coding-status row and the finalized ICD codes as NEW rows "
                    + "carrying the MCAI- prefix. Replaces any previously submitted result — idempotent, "
                    + "safe to retry. Clinical notes and hospital-entered codes are never modified.")
    @ApiResponse(responseCode = "200", description = "Written")
    @ApiResponse(responseCode = "400", description = "A code id is missing the MCAI- prefix, "
            + "status is blank, or the body is malformed")
    @ApiResponse(responseCode = "404", description = "Unknown transaction number")
    public Map<String, Object> putCodingResult(@PathVariable String tn,
            @Valid @RequestBody CodingResultRequest req) {
        // body constraints (MCAI- prefix, status) are enforced during binding
        requireCase(tn);

        // A11 status row, upsert-by-delete
        write.deleteCodingStatus(tn);
        write.insertCodingStatus(tn, req.status(), req.finalizedAt(), req.updatedBy());

        // replace all previously submitted MCAI- rows with this submission
        write.deleteMcaiCodeRows(tn);
        int written = 0;
        for (CodingResultRequest.Code c : req.codes()) {
            if (c.isProcedure()) {
                write.insertProcedureRow(tn, req.encounterType(), c.id(), c.name(), c.icd());
            } else {
                write.insertDiagnosisRow(tn, req.encounterType(), c.id(), c.name(), c.icd(),
                        c.diagnosisType());
            }
            written++;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("statusRows", 1);
        out.put("codeRows", written);
        return out;
    }

    @DeleteMapping("/api/cases/{tn}/coding-result")
    @Transactional
    @Operation(summary = "Clear the approval result for a case (reopen)",
            description = "Removes the coding-status row and every MCAI- code row. Idempotent.")
    @ApiResponse(responseCode = "200", description = "Cleared")
    @ApiResponse(responseCode = "404", description = "Unknown transaction number")
    public Map<String, Object> deleteCodingResult(@PathVariable String tn) {
        requireCase(tn);
        write.deleteCodingStatus(tn);
        write.deleteMcaiCodeRows(tn);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    private void requireCase(String tn) {
        if (!read.caseExists(tn)) {
            throw new ApiExceptionHandler.NotFoundException();
        }
    }
}
