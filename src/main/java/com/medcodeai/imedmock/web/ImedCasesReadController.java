package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.repo.ImedReadRepository;
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
 */
@RestController
public class ImedCasesReadController {

    private final ImedReadRepository repo;

    public ImedCasesReadController(ImedReadRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/api/cases")
    public List<Map<String, Object>> cases() {
        return repo.cases();
    }

    @GetMapping("/api/cases/{tn}/medical-records")
    public List<Map<String, Object>> medicalRecords(@PathVariable String tn) {
        requireCase(tn);
        return repo.medicalRecords(tn);
    }

    @GetMapping("/api/cases/{tn}/medical-record-results")
    public List<Map<String, Object>> medicalRecordResults(@PathVariable String tn) {
        requireCase(tn);
        return repo.medicalRecordResults(tn);
    }

    @GetMapping("/api/cases/{tn}/diagnoses")
    public List<Map<String, Object>> diagnoses(@PathVariable String tn) {
        requireCase(tn);
        return repo.diagnoses(tn);
    }

    @GetMapping("/api/cases/{tn}/procedures")
    public List<Map<String, Object>> procedures(@PathVariable String tn) {
        requireCase(tn);
        return repo.procedures(tn);
    }

    @GetMapping("/api/cases/{tn}/orders/drugs")
    public List<Map<String, Object>> orderDrugs(@PathVariable String tn) {
        requireCase(tn);
        return repo.orderDrugs(tn);
    }

    @GetMapping("/api/cases/{tn}/orders/labs")
    public List<Map<String, Object>> orderLabs(@PathVariable String tn) {
        requireCase(tn);
        return repo.orderLabs(tn);
    }

    @GetMapping("/api/cases/{tn}/vital-signs")
    public List<Map<String, Object>> vitalSigns(@PathVariable String tn) {
        requireCase(tn);
        return repo.vitalSigns(tn);
    }

    @GetMapping("/api/cases/{tn}/bed-management")
    public List<Map<String, Object>> bedManagement(@PathVariable String tn) {
        requireCase(tn);
        return repo.bedManagement(tn);
    }

    @GetMapping("/api/cases/{tn}/billing-items")
    public List<Map<String, Object>> billingItems(@PathVariable String tn) {
        requireCase(tn);
        return repo.billingItems(tn);
    }

    /** The coding/audit status MedCode AI wrote back; 404 while uncoded. */
    @GetMapping("/api/cases/{tn}/coding-status")
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
