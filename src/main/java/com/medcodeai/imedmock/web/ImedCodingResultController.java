package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.repo.ImedReadRepository;
import com.medcodeai.imedmock.repo.ImedWritebackRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
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
public class ImedCodingResultController {

    private final ImedReadRepository read;
    private final ImedWritebackRepository write;

    public ImedCodingResultController(ImedReadRepository read, ImedWritebackRepository write) {
        this.read = read;
        this.write = write;
    }

    @PutMapping("/api/cases/{tn}/coding-result")
    @Transactional
    public Map<String, Object> putCodingResult(@PathVariable String tn, @RequestBody Map<String, Object> body) {
        requireCase(tn);
        String encounterType = str(body.get("encounterType"));
        List<?> codes = body.get("codes") instanceof List<?> l ? l : List.of();

        // validate before writing anything: every code row needs the MCAI- id
        for (Object o : codes) {
            if (!(o instanceof Map<?, ?> c) || !(c.get("id") instanceof String id) || !id.startsWith("MCAI-")) {
                throw new ApiExceptionHandler.BadRequestException("every code needs an id prefixed 'MCAI-'");
            }
        }

        // A11 status row, upsert-by-delete
        write.deleteCodingStatus(tn);
        write.insertCodingStatus(tn, str(body.get("status")), str(body.get("finalizedAt")),
                str(body.get("updatedBy")));

        // replace all previously submitted MCAI- rows with this submission
        write.deleteMcaiCodeRows(tn);
        int written = 0;
        for (Object o : codes) {
            Map<?, ?> c = (Map<?, ?>) o;
            if ("procedure".equals(c.get("type"))) {
                write.insertProcedureRow(tn, encounterType, str(c.get("id")), str(c.get("name")),
                        str(c.get("icd")));
            } else {
                write.insertDiagnosisRow(tn, encounterType, str(c.get("id")), str(c.get("name")),
                        str(c.get("icd")), str(c.get("diagnosisType")));
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

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
