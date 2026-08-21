package com.medcodeai.api.service;

import com.medcodeai.api.client.ImedApiClient;
import com.medcodeai.api.repo.CodingRepository;
import com.medcodeai.api.repo.IcdCatalogRepository;
import com.medcodeai.api.repo.SyncRepository;
import com.medcodeai.api.web.ApiExceptionHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Inbound sync: pull the hospital's case data over the R1-R6 contract
 * (ImedApiClient) and load it into medcode's DB. Port of the retired Python
 * sync/sync.py, reshaped to be NON-DESTRUCTIVE so it is safe to re-run against
 * a live working DB:
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
 *
 * How the cases are FETCHED changed with the contract (2026-08-19). There is no
 * "download everything" endpoint by design — every read is bounded by a
 * timestamp, an id list, or a date window:
 *
 *   - windowed sync → R3 per <= 31-day chunk (long windows are split here)
 *   - unwindowed    → R1 from the epoch for the id list, then R2 in <= 20-id
 *                     batches; "everything" is just a very old timestamp
 *
 * Every run is preceded by the R6 contract check, so a hospital-side field
 * change stops the sync before any data is touched rather than half-importing.
 */
@Service
public class SyncService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SyncService.class);

    private final ImedApiClient imed;
    private final SyncRepository sync;
    private final CodingRepository coding;
    private final IcdCatalogRepository catalog;
    private final WriteGate writeGate;
    private final CasesCache cache;
    private final TransactionTemplate tx;
    private final JsonMapper json = new JsonMapper();

    public SyncService(ImedApiClient imed, SyncRepository sync, CodingRepository coding,
                       IcdCatalogRepository catalog, WriteGate writeGate, CasesCache cache,
                       PlatformTransactionManager txManager) {
        this.imed = imed;
        this.sync = sync;
        this.coding = coding;
        this.catalog = catalog;
        this.writeGate = writeGate;
        this.cache = cache;
        this.tx = new TransactionTemplate(txManager);
    }

    /**
     * The block.field names this service reads, sent to R6 before every run.
     * Anything listed here is load-bearing: if the hospital stops serving it,
     * the sync must stop rather than quietly write nulls. Fields we merely
     * pass through (the raw order rows kept as order_detail JSONB) are NOT
     * listed — losing one of those degrades a display, it doesn't corrupt data.
     */
    static final List<String> REQUIRED_FIELDS = List.of(
            "visit.visit_id", "visit.admission_number", "visit.encounter_type", "visit.sex",
            "visit.birth_date", "visit.age_year", "visit.is_pregnant",
            "visit.admission_datetime", "visit.discharge_datetime", "visit.discharge_type",
            "visit.discharge_status", "visit.health_coverage", "visit.department", "visit.ward",
            "documents.document_type", "documents.section_name", "documents.text",
            "documents.recorded_at",
            "diagnoses.object_id", "diagnoses.icd10_code", "diagnoses.description",
            "diagnoses.diagnosis_type",
            "procedures.object_id", "procedures.icd9_code", "procedures.description",
            "procedures.operation_type", "procedures.operation_start", "procedures.operation_end",
            "vitals.measured_at", "vitals.temperature", "vitals.systolic", "vitals.diastolic",
            "vitals.heart_rate", "vitals.oxygen_saturation", "vitals.weight", "vitals.height");

    /** R1's bound when the caller wants everything: older than any real visit. */
    private static final String EPOCH = "1970-01-01T00:00:00";

    /** Sync every case the hospital currently exposes. */
    public Map<String, Object> syncAll() {
        return syncAll(null, null);
    }

    /**
     * Sync only the cases whose VISIT datetime falls in [from, to] — the
     * hospital resolves a visit's datetime (admission_datetime, else the
     * datetime encoded in the visit id) and filters server-side; a null bound
     * leaves that side open. Same non-destructive per-case rules either way.
     */
    public Map<String, Object> syncAll(String from, String to) {
        preflight();
        Map<String, Object> out = run(from == null && to == null
                ? fetchAll()
                : fetchWindow(from, to));
        if (from != null || to != null) {
            Map<String, Object> window = new LinkedHashMap<>();
            window.put("from", from);
            window.put("to", to);
            out.put("window", window);
        }
        return out;
    }

    /** Sync one case; 404 when the hospital doesn't expose that visit id. */
    public Map<String, Object> syncOne(String caseId) {
        preflight();
        List<Map<String, Object>> cases = casesByIds(List.of(caseId));
        if (cases.isEmpty()) {
            throw new ApiExceptionHandler.NotFoundException();
        }
        return run(cases);
    }

    /**
     * R6 — refuse to start if the hospital no longer serves a field we depend
     * on. This runs BEFORE any fetch or write, which is the whole point: a
     * schema change should stop the sync cleanly, not surface as half-imported
     * cases with silently-nulled columns. Failure is a 500 (a hospital-side
     * dependency problem, like an unreachable API), naming the missing fields.
     */
    private void preflight() {
        Map<String, Object> answer = imed.contractCheck(REQUIRED_FIELDS);
        if (Boolean.TRUE.equals(answer.get("valid"))) {
            return;
        }
        Object missing = answer.get("missing");
        throw new IllegalStateException("hospital contract check failed — the iMed API no longer "
                + "serves: " + (missing == null ? "(unspecified)" : missing)
                + ". Sync stopped before touching any data.");
    }

    /**
     * R1 → R2: ask which visits exist/changed since the epoch, then pull them
     * in batches. The contract has no unlimited read, so "everything" is
     * expressed as a timestamp older than any visit.
     */
    private List<Map<String, Object>> fetchAll() {
        Object ids = imed.checkChanges(EPOCH).get("visit_ids");
        List<String> visitIds = new ArrayList<>();
        if (ids instanceof List<?> l) {
            for (Object id : l) {
                if (id != null) {
                    visitIds.add(id.toString());
                }
            }
        }
        return casesByIds(visitIds);
    }

    /** R2 in batches of at most {@link ImedApiClient#MAX_SYNC_BATCH} ids. */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> casesByIds(List<String> visitIds) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < visitIds.size(); i += ImedApiClient.MAX_SYNC_BATCH) {
            List<String> batch =
                    visitIds.subList(i, Math.min(i + ImedApiClient.MAX_SYNC_BATCH, visitIds.size()));
            Object cases = imed.syncCases(batch).get("cases");
            if (cases instanceof List<?> l) {
                out.addAll((List<Map<String, Object>>) l);
            }
        }
        return out;
    }

    /**
     * R3, split into chunks the hospital will accept. An open bound is closed
     * against the visit-id date encoding's own range rather than left unbounded,
     * because R3 requires both ends.
     */
    private List<Map<String, Object>> fetchWindow(String from, String to) {
        LocalDate start = date(from, LocalDate.of(2000, 1, 1));
        LocalDate end = date(to, LocalDate.now());
        if (end.isBefore(start)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (LocalDate cursor = start; !cursor.isAfter(end); ) {
            // inclusive bounds, so a 31-day window spans cursor .. cursor+30
            LocalDate chunkEnd = cursor.plusDays(ImedApiClient.MAX_PERIOD_DAYS - 1L);
            if (chunkEnd.isAfter(end)) {
                chunkEnd = end;
            }
            out.addAll(imed.syncByPeriod(cursor + "T00:00:00", chunkEnd + "T23:59:59"));
            cursor = chunkEnd.plusDays(1);
        }
        return out;
    }

    private static LocalDate date(String bound, LocalDate fallback) {
        if (bound == null || bound.length() < 10) {
            return fallback;
        }
        try {
            return LocalDate.parse(bound.substring(0, 10));
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    private Map<String, Object> run(List<Map<String, Object>> cases) {
        Map<String, Object> result = writeGate.locked(() -> {
            String now = ApprovalService.nowStr();
            List<String> imported = new ArrayList<>();
            List<String> refreshed = new ArrayList<>();
            List<String> skippedApproved = new ArrayList<>();
            List<Map<String, Object>> failed = new ArrayList<>();
            Map<String, Integer> stats = newStats();

            // REF (doc B4): coverage reference from the hospital's own codes, first
            tx.execute(s -> {
                loadCoverageTypes(cases, stats);
                return null;
            });

            // REF: the hospital's ICD code master → our icd_10/icd_9 catalogs,
            // before the per-case loop so imported codes land on catalog rows
            List<Map<String, Object>> icd10 = imed.icd10Codes();   // hospital reads, outside the tx
            List<Map<String, Object>> icd9 = imed.icd9Codes();
            tx.execute(s -> {
                loadIcdCatalogs(icd10, icd9, stats);
                return null;
            });

            for (Map<String, Object> c : cases) {
                Map<String, Object> visit = block(c, "visit");
                String tn = str(visit.get("visit_id"));
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
                    tx.execute(s -> {
                        writeCase(tn, visit, c, isNew, now, stats);
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

    /**
     * One data block of the contract's case object. Blocks are always present
     * and always arrays ("blocks with no data are empty arrays"), but a missing
     * or malformed one degrades to empty rather than failing the whole case.
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Map<String, Object> caseObject, String block) {
        Object v = caseObject.get(block);
        return v instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> block(Map<String, Object> caseObject, String name) {
        Object v = caseObject.get(name);
        return v instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    // sync.py:147 the per-case body: derive CREATE fields, then load READ rows.
    // Keys are the contract's (visit.visit_id, diagnoses.icd10_code, …), not the
    // extract's — the hospital renames on its side now.
    private void writeCase(String tn, Map<String, Object> visit, Map<String, Object> c,
                           boolean isNew, String now, Map<String, Integer> stats) {
        List<Map<String, Object>> documents = rows(c, "documents");
        List<Map<String, Object>> recordResults = rows(c, "record_results");
        List<Map<String, Object>> diagnoses = rows(c, "diagnoses");
        List<Map<String, Object>> procedures = rows(c, "procedures");
        List<Map<String, Object>> drugOrders = rows(c, "drug_orders");
        List<Map<String, Object>> labResults = rows(c, "lab_results");
        List<Map<String, Object>> vitals = rows(c, "vitals");
        List<Map<String, Object>> wardMovements = rows(c, "ward_movements");
        List<Map<String, Object>> billingItems = rows(c, "billing_items");

        // encounter_type arrives derived now ("OPD"/"IPD"); our column keeps the
        // extract's 0/1, so translate rather than store the hospital's word.
        String enc = "IPD".equals(str(visit.get("encounter_type"))) ? "1" : "0";

        Map<String, Object> primary = null;
        int comorbidities = 0;
        boolean hasIcd10 = false;
        for (Map<String, Object> d : diagnoses) {
            String dtype = str(d.get("diagnosis_type"));
            if (primary == null && "PRIMARY_DIAGNOSIS".equals(dtype)) {
                primary = d;
            }
            if ("COMORBIDITY".equals(dtype)) {
                comorbidities++;
            }
            if (truthy(str(d.get("icd10_code")))) {
                hasIcd10 = true;
            }
        }
        boolean hasIcd9 = false;
        for (Map<String, Object> pr : procedures) {
            if (truthy(str(pr.get("icd9_code")))) {
                hasIcd9 = true;
            }
        }
        List<String> missing = SyncRules.missingCodes(hasIcd10, hasIcd9);
        String completeness = missing.isEmpty() ? "complete" : "incomplete";
        String missingDetail = missing.isEmpty() ? null : String.join(",", missing);
        String group = SyncRules.diseaseGroup(primary == null ? null : str(primary.get("icd10_code")));
        String severity = SyncRules.severity(comorbidities);

        // department/ward: the visit block already carries the latest bed row's
        // values, so ward_movements is only needed for its own detail rows.
        String patientRef = str(visit.get("admission_number"));
        String birthdate = first10(str(visit.get("birth_date")));
        String coverage = trimOrNull(str(visit.get("health_coverage")));
        String admission = SyncRules.parseDt(str(visit.get("admission_datetime")));
        String discharge = SyncRules.parseDt(str(visit.get("discharge_datetime")));
        String ageYear = trimOrNull(str(visit.get("age_year")));
        String ward = trimOrNull(str(visit.get("ward")));
        String department = trimOrNull(str(visit.get("department")));

        if (isNew) {
            sync.insertCase(tn, patientRef, enc, str(visit.get("sex")), birthdate, ageYear,
                    admission, discharge, str(visit.get("discharge_type")),
                    str(visit.get("discharge_status")), str(visit.get("is_pregnant")),
                    ward, department, coverage, completeness, missingDetail, group, severity, now);
        } else {
            sync.updateCaseClinical(tn, patientRef, enc, str(visit.get("sex")), birthdate, ageYear,
                    admission, discharge, str(visit.get("discharge_type")),
                    str(visit.get("discharge_status")), str(visit.get("is_pregnant")),
                    ward, department, coverage, completeness, missingDetail, group, severity, now);
            sync.deleteSections(tn);
            sync.deleteChunks(tn);
            sync.deleteOrders(tn);
            sync.deleteImportedCodes(tn);
            sync.deleteVitals(tn);
        }
        bump(stats, "cases");

        // READ → report sections (+ CREATE chunks, F11)
        for (Map<String, Object> d : documents) {
            sync.insertSection(tn, str(d.get("document_type")), str(d.get("section_name")),
                    str(d.get("text")), SyncRules.parseDt(str(d.get("recorded_at"))));
            bump(stats, "sections");
            List<String> chunks = SyncRules.chunk(str(d.get("text")));
            for (int i = 0; i < chunks.size(); i++) {
                sync.insertChunk(tn, chunks.get(i), i);
                bump(stats, "chunks");
            }
        }

        // READ → codes: diagnoses (ICD-10) then procedures (ICD-9, which carry
        // the hospital's operation time window)
        for (Map<String, Object> d : diagnoses) {
            String icd = str(d.get("icd10_code"));
            if (truthy(icd)) {
                // null-safe: the hospital does ship diagnoses with no type
                // (Python's .get(None) quietly fell back to 'other'; match that)
                String dtype = str(d.get("diagnosis_type"));
                importCode(tn, icd, "ICD-10", str(d.get("description")),
                        dtype == null ? "other" : SyncRules.DIAG_ROLE.getOrDefault(dtype, "other"),
                        str(d.get("object_id")), null, null, null, stats);
            }
        }
        for (Map<String, Object> pr : procedures) {
            String icd = str(pr.get("icd9_code"));
            if (truthy(icd)) {
                importCode(tn, icd, "ICD-9", str(pr.get("description")), "procedure",
                        str(pr.get("object_id")),
                        SyncRules.parseDt(str(pr.get("operation_start"))),
                        SyncRules.parseDt(str(pr.get("operation_end"))),
                        trimOrNull(str(pr.get("operation_type"))), stats);
            }
        }

        // READ → vital-sign readings (the hospital UI's strip above CC/PI/PE);
        // verbatim text, blanks normalized to null
        for (Map<String, Object> v : vitals) {
            sync.insertVital(tn, SyncRules.parseDt(str(v.get("measured_at"))),
                    trimOrNull(str(v.get("temperature"))),
                    trimOrNull(str(v.get("systolic"))),
                    trimOrNull(str(v.get("diastolic"))),
                    trimOrNull(str(v.get("heart_rate"))),
                    trimOrNull(str(v.get("oxygen_saturation"))),
                    trimOrNull(str(v.get("weight"))),
                    trimOrNull(str(v.get("height"))));
            bump(stats, "vitals");
        }

        // READ → orders (drugs, labs, radiology results, OR procedures, billing).
        // The whole row is kept as order_detail JSONB, so these now carry the
        // contract's key names; the frontend reads new-or-old (rows synced
        // before 2026-08-19 still hold the extract's names).
        for (Map<String, Object> r : drugOrders) {
            order(tn, "medicine", "MedHack_OrderDrug", str(r.get("object_id")), str(r.get("name")),
                    r, str(r.get("received_at")), stats);
        }
        for (Map<String, Object> r : labResults) {
            order(tn, "lab", "MedHack_OrderLAB", str(r.get("object_id")), str(r.get("panel_name")),
                    r, str(r.get("reported_at")), stats);
        }
        for (Map<String, Object> r : recordResults) {
            String cat = "Radiology Report".equals(str(r.get("document_type"))) ? "X-ray" : "other";
            order(tn, cat, "MedHack_MedicalRecord_result", str(r.get("field_id")), str(r.get("name")),
                    r, str(r.get("recorded_at")), stats);
        }
        for (Map<String, Object> r : procedures) {
            if ("OR Procedure".equals(str(r.get("operation_type")))) {
                order(tn, "surgery", "MedHack_Procedure(ICD9)", str(r.get("object_id")),
                        str(r.get("description")), r, str(r.get("operation_start")), stats);
            }
        }
        for (Map<String, Object> r : billingItems) {
            order(tn, "other", "MedHack_BillingItem", str(r.get("object_id")), str(r.get("name")),
                    r, str(r.get("verified_at")), stats);
        }
        // ward_movements is read for the visit's department/ward only (the
        // hospital already resolved "latest" into the visit block) — no order
        // rows, matching the pre-contract behaviour.
        if (!wardMovements.isEmpty() && department == null) {
            log.debug("case {} has {} ward movements but no department on the visit block",
                    tn, wardMovements.size());
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

    /**
     * {@code when} is normalized like every other stored datetime: these are
     * TEXT columns rendered verbatim by the frontend, and the contract sends
     * ISO 8601 where the old extract sent "YYYY-MM-DD HH:MM:SS". The raw row
     * kept in order_detail is NOT touched — that one is the hospital's, as-is.
     */
    private void order(String tn, String category, String source, String ref, String name,
                       Map<String, Object> detail, String when, Map<String, Integer> stats) {
        sync.insertOrder(tn, category, source, ref, name, json.writeValueAsString(detail),
                SyncRules.parseDt(when));
        bump(stats, "orders");
    }

    /**
     * The hospital's ICD reference catalogs → our icd_10/icd_9. Same
     * non-destructive posture as the knowledge-document code sync: insert new
     * codes, fill blank descriptions, NEVER overwrite an existing description
     * (typically better free text from real case data or the coder).
     */
    private void loadIcdCatalogs(List<Map<String, Object>> icd10, List<Map<String, Object>> icd9,
                                 Map<String, Integer> stats) {
        Map<String, String> existing = catalog.existingDescriptions();
        List<Object[]> toInsert = new ArrayList<>();
        List<Object[]> toFill = new ArrayList<>();
        collectCatalogRows(icd10, "ICD-10", existing, toInsert, toFill);
        collectCatalogRows(icd9, "ICD-9", existing, toInsert, toFill);
        if (!toInsert.isEmpty()) {
            catalog.insertCodes(toInsert);
        }
        if (!toFill.isEmpty()) {
            catalog.fillDescriptions(toFill);
        }
        stats.put("catalogCodes", toInsert.size() + toFill.size());
    }

    private static void collectCatalogRows(List<Map<String, Object>> rows, String system,
                                           Map<String, String> existing,
                                           List<Object[]> toInsert, List<Object[]> toFill) {
        for (Map<String, Object> r : rows) {
            String code = trimOrNull(str(r.get("code")));
            if (code == null) {
                continue;
            }
            String description = trimOrNull(str(r.get("description")));
            String current = existing.get(code + "|" + system);
            if (current == null) {
                toInsert.add(new Object[]{code, system, description});
            } else if (current.isBlank() && description != null) {
                toFill.add(new Object[]{description, code, system});
            }
        }
    }

    // sync.py:111 load_coverage_types() — distinct hospital coverage codes → reference rows
    private void loadCoverageTypes(List<Map<String, Object>> cases, Map<String, Integer> stats) {
        Set<String> seen = new HashSet<>();
        for (Map<String, Object> c : cases) {
            String code = trimOrNull(str(block(c, "visit").get("health_coverage")));
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
        for (String k : List.of("cases", "sections", "codes", "orders", "chunks", "vitals",
                "coverageTypes", "catalogCodes")) {
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
