package com.medcodeai.api.service;

import com.medcodeai.api.client.ImedApiClient;
import com.medcodeai.api.repo.CodingRepository;
import com.medcodeai.api.repo.SyncRepository;
import com.medcodeai.api.web.ApiExceptionHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Inbound sync: pull the hospital's case data (ImedApiClient read endpoints) and
 * load it into medcode's DB. Port of the retired Python sync/sync.py, reshaped
 * to be NON-DESTRUCTIVE so it is safe to re-run against a live working DB:
 *
 *   - new case (unknown to medcode)  → full import
 *   - existing OPEN case             → refresh hospital-sourced rows only
 *   - existing non-open case         → skipped, left intact (finalized coding
 *                                       is never silently invalidated)
 *
 * "Refresh" replaces ONLY hospital-sourced rows (cases clinical columns,
 * sections, chunks, orders, imported case_codes); coder work — coder_assigned
 * codes, case_code_edits, case_report_drafts, case_status, coding_history — is
 * never touched (a case_synced history row is only appended). This makes a
 * re-sync idempotent.
 *
 * Concurrency mirrors ApprovalService: the whole batch runs under the WriteGate
 * lock (one writer), each case commits in its own transaction so a single bad
 * case doesn't roll back the batch, and the cases cache is invalidated once at
 * the end. Sync is READ-ONLY toward the hospital — no write-back calls.
 */
@Service
public class SyncService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SyncService.class);

    private final ImedApiClient imed;
    private final SyncRepository sync;
    private final CodingRepository coding;
    private final WriteGate writeGate;
    private final CasesCache cache;
    private final TransactionTemplate tx;
    private final JsonMapper json = new JsonMapper();

    public SyncService(ImedApiClient imed, SyncRepository sync, CodingRepository coding,
                       WriteGate writeGate, CasesCache cache, PlatformTransactionManager txManager) {
        this.imed = imed;
        this.sync = sync;
        this.coding = coding;
        this.writeGate = writeGate;
        this.cache = cache;
        this.tx = new TransactionTemplate(txManager);
    }

    /** Sync every case the hospital currently exposes. */
    public Map<String, Object> syncAll() {
        return run(imed.cases());
    }

    /** Sync one case; 404 when the hospital doesn't expose that transaction number. */
    public Map<String, Object> syncOne(String caseId) {
        Map<String, Object> match = null;
        for (Map<String, Object> p : imed.cases()) {
            if (caseId.equals(str(p.get("transactionnumber")))) {
                match = p;
                break;
            }
        }
        if (match == null) {
            throw new ApiExceptionHandler.NotFoundException();
        }
        return run(List.of(match));
    }

    private Map<String, Object> run(List<Map<String, Object>> patients) {
        Map<String, Object> result = writeGate.locked(() -> {
            String now = ApprovalService.nowStr();
            List<String> imported = new ArrayList<>();
            List<String> refreshed = new ArrayList<>();
            List<String> skippedApproved = new ArrayList<>();
            List<Map<String, Object>> failed = new ArrayList<>();
            Map<String, Integer> stats = newStats();

            // REF (doc B4): coverage reference from the hospital's own codes, first
            tx.execute(s -> {
                loadCoverageTypes(patients, stats);
                return null;
            });

            for (Map<String, Object> p : patients) {
                String tn = str(p.get("transactionnumber"));
                if (tn == null) {
                    continue;
                }
                try {
                    String status = sync.caseStatus(tn);
                    if (status != null && !status.equals("open")) {
                        skippedApproved.add(tn); // protect finalized coding
                        continue;
                    }
                    boolean isNew = status == null;
                    CaseBundle b = fetchBundle(tn);       // hospital reads, outside the tx
                    tx.execute(s -> {
                        writeCase(tn, p, b, isNew, now, stats);
                        return null;
                    });
                    (isNew ? imported : refreshed).add(tn);
                } catch (RuntimeException e) {
                    log.warn("sync failed for case {}", tn, e);
                    Map<String, Object> f = new LinkedHashMap<>();
                    f.put("caseId", tn);
                    f.put("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
                    failed.add(f);
                }
            }

            Map<String, Object> o = new LinkedHashMap<>();
            o.put("ok", true);
            o.put("imported", imported);
            o.put("refreshed", refreshed);
            o.put("skippedApproved", skippedApproved);
            o.put("failed", failed);
            o.put("stats", stats);
            return o;
        });
        cache.invalidate();
        return result;
    }

    /** All per-visit hospital tables for one case, fetched over HTTP. */
    private record CaseBundle(
            List<Map<String, Object>> sections,
            List<Map<String, Object>> results,
            List<Map<String, Object>> diags,
            List<Map<String, Object>> procs,
            List<Map<String, Object>> drugs,
            List<Map<String, Object>> labs,
            List<Map<String, Object>> beds,
            List<Map<String, Object>> bills,
            List<Map<String, Object>> vitals) {
    }

    private CaseBundle fetchBundle(String tn) {
        return new CaseBundle(
                imed.medicalRecords(tn),
                imed.medicalRecordResults(tn),
                imed.diagnoses(tn),
                imed.procedures(tn),
                imed.orderDrugs(tn),
                imed.orderLabs(tn),
                imed.bedManagement(tn),
                imed.billingItems(tn),
                imed.vitalSigns(tn));
    }

    // sync.py:147 the per-case body: derive CREATE fields, then load READ rows
    private void writeCase(String tn, Map<String, Object> p, CaseBundle b,
                           boolean isNew, String now, Map<String, Integer> stats) {
        String enc = SyncRules.encounterType(str(p.get("admissionnumber")));

        Set<String> haveFields = new HashSet<>();
        Set<String> docTypes = new HashSet<>();
        for (Map<String, Object> s : b.sections()) {
            haveFields.add(str(s.get("fieldname")));
            docTypes.add(str(s.get("documenttype")));
        }
        Map<String, Object> primary = null;
        int comorbidities = 0;
        for (Map<String, Object> d : b.diags()) {
            String dtype = str(d.get("diagnosistype"));
            if (primary == null && "PRIMARY_DIAGNOSIS".equals(dtype)) {
                primary = d;
            }
            if ("COMORBIDITY".equals(dtype)) {
                comorbidities++;
            }
        }
        List<String> missing = SyncRules.missingSections(enc, haveFields, docTypes, primary != null);
        String completeness = missing.isEmpty() ? "complete" : "incomplete";
        String missingDetail = missing.isEmpty() ? null : String.join(",", missing);
        String group = SyncRules.diseaseGroup(primary == null ? null : str(primary.get("icd")));
        String severity = SyncRules.severity(comorbidities);

        Map<String, Object> latestBed = b.beds().isEmpty() ? Map.of() : b.beds().get(b.beds().size() - 1);
        String patientRef = str(p.get("admissionnumber"));
        String birthdate = first10(str(p.get("birthdate")));
        String coverage = trimOrNull(str(p.get("healthcoverage")));
        String admission = SyncRules.parseDt(str(p.get("admissiondatetime")));
        String discharge = SyncRules.parseDt(str(p.get("dischargedatetime")));

        if (isNew) {
            sync.insertCase(tn, patientRef, enc, str(p.get("sex")), birthdate, str(p.get("ageyear")),
                    admission, discharge, str(p.get("dischargetype")), str(p.get("dischargestatus")),
                    str(p.get("ispregnant")), str(latestBed.get("ward")), str(latestBed.get("department")),
                    coverage, completeness, missingDetail, group, severity, now);
        } else {
            sync.updateCaseClinical(tn, patientRef, enc, str(p.get("sex")), birthdate, str(p.get("ageyear")),
                    admission, discharge, str(p.get("dischargetype")), str(p.get("dischargestatus")),
                    str(p.get("ispregnant")), str(latestBed.get("ward")), str(latestBed.get("department")),
                    coverage, completeness, missingDetail, group, severity, now);
            sync.deleteSections(tn);
            sync.deleteChunks(tn);
            sync.deleteOrders(tn);
            sync.deleteImportedCodes(tn);
            sync.deleteVitals(tn);
        }
        bump(stats, "cases");

        // READ → report sections (+ CREATE chunks, F11)
        for (Map<String, Object> s : b.sections()) {
            sync.insertSection(tn, str(s.get("documenttype")), str(s.get("fieldname")),
                    str(s.get("value")), str(s.get("recorddatetime")));
            bump(stats, "sections");
            List<String> chunks = SyncRules.chunk(str(s.get("value")));
            for (int i = 0; i < chunks.size(); i++) {
                sync.insertChunk(tn, chunks.get(i), i);
                bump(stats, "chunks");
            }
        }

        // READ → codes: diagnoses (ICD-10) then procedures (ICD-9, which carry
        // the hospital's operation time window)
        for (Map<String, Object> d : b.diags()) {
            String icd = str(d.get("icd"));
            if (truthy(icd)) {
                // null-safe: Map.of NPEs on a null key, and the hospital does
                // ship diagnoses with no diagnosistype (Python's .get(None)
                // quietly fell back to 'other'; match that)
                String dtype = str(d.get("diagnosistype"));
                importCode(tn, icd, "ICD-10", str(d.get("name")),
                        dtype == null ? "other" : SyncRules.DIAG_ROLE.getOrDefault(dtype, "other"),
                        str(d.get("id")), null, null, null, stats);
            }
        }
        for (Map<String, Object> pr : b.procs()) {
            String icd = str(pr.get("icd"));
            if (truthy(icd)) {
                importCode(tn, icd, "ICD-9", str(pr.get("name")), "procedure", str(pr.get("id")),
                        SyncRules.parseDt(str(pr.get("startdatetime"))),
                        SyncRules.parseDt(str(pr.get("enddatetime"))),
                        trimOrNull(str(pr.get("operationtype"))), stats);
            }
        }

        // READ → vital-sign readings (the hospital UI's strip above CC/PI/PE);
        // verbatim text, blanks normalized to null
        for (Map<String, Object> v : b.vitals()) {
            sync.insertVital(tn, SyncRules.parseDt(str(v.get("measuredatetime"))),
                    trimOrNull(str(v.get("temperature"))),
                    trimOrNull(str(v.get("systolicbloodpressure"))),
                    trimOrNull(str(v.get("diastolicbloodpressure"))),
                    trimOrNull(str(v.get("heartrate"))),
                    trimOrNull(str(v.get("oxygensaturation"))),
                    trimOrNull(str(v.get("weight"))),
                    trimOrNull(str(v.get("height"))));
            bump(stats, "vitals");
        }

        // READ → orders (drugs, labs, radiology results, OR procedures, billing)
        for (Map<String, Object> r : b.drugs()) {
            order(tn, "medicine", "MedHack_OrderDrug", str(r.get("id")), str(r.get("name")),
                    r, str(r.get("receiveddatetime")), stats);
        }
        for (Map<String, Object> r : b.labs()) {
            order(tn, "lab", "MedHack_OrderLAB", str(r.get("id")), str(r.get("panelname")),
                    r, str(r.get("reportdatetime")), stats);
        }
        for (Map<String, Object> r : b.results()) {
            String cat = "Radiology Report".equals(str(r.get("documenttype"))) ? "X-ray" : "other";
            order(tn, cat, "MedHack_MedicalRecord_result", str(r.get("fieldid")), str(r.get("name")),
                    r, str(r.get("recorddatetime")), stats);
        }
        for (Map<String, Object> r : b.procs()) {
            if ("OR Procedure".equals(str(r.get("operationtype")))) {
                order(tn, "surgery", "MedHack_Procedure(ICD9)", str(r.get("id")), str(r.get("name")),
                        r, str(r.get("startdatetime")), stats);
            }
        }
        for (Map<String, Object> r : b.bills()) {
            order(tn, "other", "MedHack_BillingItem", str(r.get("id")), str(r.get("name")),
                    r, str(r.get("verifydatetime")), stats);
        }

        // CREATE → audit-trail entry for the sync itself (traceability, F12)
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("source", "iMed mock");
        detail.put("fetched_at", now);
        coding.insertHistory(tn, null, "case_synced", json.writeValueAsString(detail));
    }

    // sync.py:207 code_row() — find-or-create the catalog row, then link it
    private void importCode(String tn, String code, String system, String desc,
                            String role, String ref, String operationStart, String operationEnd,
                            String operationType, Map<String, Integer> stats) {
        Integer icdId = coding.findIcdCodeId(code, system);
        if (icdId == null) {
            icdId = coding.insertIcdCode(code, system, desc);
        }
        sync.insertImportedCode(tn, system, icdId, role, ref, operationStart, operationEnd, operationType);
        bump(stats, "codes");
    }

    private void order(String tn, String category, String source, String ref, String name,
                       Map<String, Object> detail, String when, Map<String, Integer> stats) {
        sync.insertOrder(tn, category, source, ref, name, json.writeValueAsString(detail), when);
        bump(stats, "orders");
    }

    // sync.py:111 load_coverage_types() — distinct hospital coverage codes → reference rows
    private void loadCoverageTypes(List<Map<String, Object>> patients, Map<String, Integer> stats) {
        Set<String> seen = new HashSet<>();
        for (Map<String, Object> p : patients) {
            String code = trimOrNull(str(p.get("healthcoverage")));
            if (code == null || !seen.add(code)) {
                continue;
            }
            String family = SyncRules.coverageFamily(code);
            if (sync.upsertCoverageType(code, family, SyncRules.familyPayer(family))) {
                bump(stats, "coverageTypes");
            }
        }
    }

    private static Map<String, Integer> newStats() {
        Map<String, Integer> s = new LinkedHashMap<>();
        for (String k : List.of("cases", "sections", "codes", "orders", "chunks", "vitals", "coverageTypes")) {
            s.put(k, 0);
        }
        return s;
    }

    private static void bump(Map<String, Integer> stats, String key) {
        stats.merge(key, 1, Integer::sum);
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static boolean truthy(String s) {
        return s != null && !s.isEmpty();
    }

    private static String trimOrNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }

    // sync.py:190 (case['birthdate'] or '')[:10] or None — keep the date, drop any time
    private static String first10(String s) {
        if (s == null || s.isEmpty()) {
            return null;
        }
        return s.length() <= 10 ? s : s.substring(0, 10);
    }
}
