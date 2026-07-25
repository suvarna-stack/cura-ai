package com.medcodeai.api.service;

import com.medcodeai.api.repo.CasesRepository;
import com.medcodeai.api.repo.CodingRepository;
import com.medcodeai.api.repo.WorkingStateRepository;
import com.medcodeai.api.web.ApiExceptionHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The approval workflow: approve (materialize edits + finalize + send results
 * to the hospital) and reopen. Ported from server/app.py + sync/writeback.py.
 *
 * Structure per write request: WriteGate lock -> ONE DB transaction (our
 * database only) -> hospital HTTP calls -> unlock -> cache invalidate. The
 * hospital ops are QUEUED while the transaction runs and sent only after it
 * commits — the same order as the Flask reference's
 * mc.commit()-then-imed.commit(). If a hospital call fails the request 500s
 * with our side already committed; re-approving / re-reopening heals.
 *
 * Since 2026-07-24 the hospital side speaks the REAL iMed contract: the
 * queued ops are executed by ImedWritebackService, which diffs the finalized
 * code set against the hospital's live rows (POST new / PUT changed / DELETE
 * removed, by object_id) and journals every touched row so reopen can revert.
 * Healing still holds — the diff recomputes against live state on retry.
 */
@Service
public class ApprovalService {

    // sync.py:86 DIAG_ROLE reversed (writeback.py:27 ROLE_TO_DIAGTYPE)
    private static final Map<String, String> ROLE_TO_DIAGTYPE = Map.of(
            "principal_diagnosis", "PRIMARY_DIAGNOSIS",
            "secondary_diagnosis", "COMORBIDITY",
            "other", "OTHERS",
            "external_cause", "EXTERNAL_CAUSE_OF_INJURY");

    private final CasesRepository cases;
    private final CodingRepository coding;
    private final ImedWritebackService writeback;
    private final WorkingStateRepository workingState;
    private final WriteGate writeGate;
    private final CasesCache cache;
    private final TransactionTemplate tx;
    private final JsonMapper json = new JsonMapper();

    /** One queued hospital action; null targets means reopen (revert). */
    private record ImedOp(String tn, String encountertype,
            List<ImedWritebackService.TargetCode> targets, String coder, String now) {
    }

    public ApprovalService(CasesRepository cases, CodingRepository coding,
                           ImedWritebackService writeback, WorkingStateRepository workingState,
                           WriteGate writeGate, CasesCache cache, PlatformTransactionManager txManager) {
        this.cases = cases;
        this.coding = coding;
        this.writeback = writeback;
        this.workingState = workingState;
        this.writeGate = writeGate;
        this.cache = cache;
        this.tx = new TransactionTemplate(txManager);
    }

    // app.py:118 now_str()
    public static String nowStr() {
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    // app.py:299 approve() — response {ok, approved, notFound, stats}.
    // Since Phase 3 the coder identity comes from the authenticated principal
    // (controller passes uid + email); ensureDemoCoder remains as fallback for
    // the demo-reset path, which acts as the baseline coder, not the caller.
    public Map<String, Object> approve(List<String> ids, Integer userId, String coder) {
        Map<String, Object> result = writeGate.locked(() -> {
            List<ImedOp> ops = new ArrayList<>();
            Map<String, Object> out = tx.execute(status -> {
                String now = nowStr();
                Map<String, Integer> stats = newStats();
                Integer uid = userId != null ? userId : ensureDemoCoder(coder);
                List<String> approved = new ArrayList<>();
                List<String> notFound = new ArrayList<>();
                for (String tn : ids) {
                    if (!cases.caseExists(tn)) {
                        notFound.add(tn);
                        continue;
                    }
                    materializeCodeEdits(tn, uid, coder, now, stats);
                    finalizeCase(tn, coder, now, stats, ops);
                    approved.add(tn);
                }
                Map<String, Object> o = new LinkedHashMap<>();
                o.put("ok", true);
                o.put("approved", approved);
                o.put("notFound", notFound);
                o.put("stats", stats);
                return o;
            });
            // after our commit — Flask's two-commit order; the hospital write
            // count is only known once the diff has run, so patch it in now
            int writes = runImedOps(ops);
            @SuppressWarnings("unchecked")
            Map<String, Integer> stats = (Map<String, Integer>) out.get("stats");
            stats.put("mcai_code_rows", writes);
            return out;
        });
        cache.invalidate();
        return result;
    }

    // app.py:360 reopen()
    public Map<String, Object> reopen(String caseId, String coder) {
        writeGate.locked(() -> {
            List<ImedOp> ops = new ArrayList<>();
            tx.execute(status -> {
                if (!cases.caseExists(caseId)) {
                    throw new ApiExceptionHandler.NotFoundException();
                }
                reopenCaseRows(caseId, coder, ops);
                return null;
            });
            runImedOps(ops);
            return null;
        });
        cache.invalidate();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    // app.py:379 demo_reset() — restore the run_demo baseline in one bulk call:
    // reopen every non-baseline approval (actor "demo.reset", which views.py
    // hides from coder lists and the Reopen tab), then re-finalize baseline
    // cases a visitor reopened or approved-over — via the original run_demo
    // path (re-confirm the principal), NOT the visitor's saved edits.
    // Edits and drafts are kept, same as a single reopen.
    public Map<String, Object> demoReset(String baselineCoder) {
        Map<String, Object> result = writeGate.locked(() -> {
            List<ImedOp> ops = new ArrayList<>();
            Map<String, Object> out = tx.execute(status -> {
                String now = nowStr();
                Map<String, Integer> stats = newStats();

                // baseline = cases EVER finalized by the run_demo coder; last_by =
                // most recent finalizer (same ordering as the finished tab's coder)
                java.util.Set<String> baseline = new java.util.TreeSet<>();
                Map<String, String> lastBy = new LinkedHashMap<>();
                for (Map<String, Object> r : cases.approvalRows()) {
                    String by = detailBy((String) r.get("action_detail"));
                    if (Py.truthy(by)) {
                        lastBy.put((String) r.get("case_id"), by);
                        if (by.equals(baselineCoder)) {
                            baseline.add((String) r.get("case_id"));
                        }
                    }
                }
                java.util.Set<String> approvedNow = new java.util.TreeSet<>(coding.approvedCaseIds());

                int reopened = 0;
                int restored = 0;
                for (String cid : approvedNow) {          // sorted(approved_now - baseline)
                    if (baseline.contains(cid)) {
                        continue;
                    }
                    reopenCaseRows(cid, "demo.reset", ops);
                    reopened++;
                }
                Integer uid = null;
                for (String cid : baseline) {             // sorted(baseline)
                    if (approvedNow.contains(cid) && baselineCoder.equals(lastBy.get(cid))) {
                        continue; // untouched baseline case
                    }
                    if (uid == null) {
                        uid = ensureDemoCoder(baselineCoder);
                    }
                    if (approvedNow.contains(cid)) {      // re-approved by a visitor
                        reopenCaseRows(cid, "demo.reset", ops);
                    }
                    simulateCoderAssignment(cid, uid, baselineCoder, now, stats);
                    finalizeCase(cid, baselineCoder, now, stats, ops);
                    restored++;
                }

                Map<String, Object> o = new LinkedHashMap<>();
                o.put("ok", true);
                o.put("reopened", reopened);
                o.put("restoredBaseline", restored);
                return o;
            });
            runImedOps(ops);
            return out;
        });
        cache.invalidate();
        return result;
    }

    // views.py:149 semantics — json.loads(detail or '{}').get('by'), errors -> null
    private String detailBy(String actionDetail) {
        if (!Py.truthy(actionDetail)) {
            return null;
        }
        try {
            Object v = json.readValue(actionDetail, LinkedHashMap.class).get("by");
            return v == null ? null : v.toString();
        } catch (RuntimeException e) {
            return null;
        }
    }

    static Map<String, Integer> newStats() {
        Map<String, Integer> stats = new LinkedHashMap<>();
        stats.put("cases_finalized", 0);
        stats.put("status_rows", 0);
        stats.put("coder_codes_created", 0);
        stats.put("mcai_code_rows", 0);
        return stats;
    }

    private static void bump(Map<String, Integer> stats, String key) {
        stats.merge(key, 1, Integer::sum);
    }

    // writeback.py:30 ensure_demo_coder()
    Integer ensureDemoCoder(String coder) {
        String email = coder + "@medcodeai.demo";
        Integer uid = coding.findUserId(email);
        return uid != null ? uid : coding.insertUser(email, coder, "coder");
    }

    // app.py:129 materialize_code_edits() — the coder's saved UI edits become
    // real case_codes rows; with no saved edits, fall back to re-confirming
    // the imported principal (POC behavior)
    void materializeCodeEdits(String tn, Integer uid, String coder, String now, Map<String, Integer> stats) {
        String payload = workingState.loadEditsPayload(tn);
        if (payload == null) {
            simulateCoderAssignment(tn, uid, coder, now, stats);
            return;
        }
        List<?> entries;
        try {
            Object parsed = json.readValue(payload, Object.class);
            entries = parsed instanceof List<?> l ? l : List.of();
        } catch (RuntimeException e) {
            entries = List.of();
        }

        // replace, don't append: re-approving after new edits must not duplicate
        coding.deleteCoderAssigned(tn);
        boolean firstIcd10 = true;
        int written = 0;
        for (Object o : entries) {
            if (!(o instanceof Map<?, ?> e) || jsTruthy(e.get("missing"))) {
                continue; // unresolved "???" placeholder rows never reach the DB
            }
            String code = Py.or_(str(e.get("code")), "").strip();
            if (code.isEmpty() || code.equals("???")) {
                continue;
            }
            String ctype = Py.or_(str(e.get("type")), "ICD-10").strip();
            String desc = Py.or_(str(e.get("desc")), "");

            Integer icdId = coding.findIcdCodeId(code, ctype);
            if (icdId == null) {
                icdId = coding.insertIcdCode(code, ctype, desc);
            }

            // [POC] StoredCode carries no explicit role; derive one: procedures
            // by system, first ICD-10 = principal, other ICD-10 secondary
            String role;
            if (ctype.equals("ICD-9") || ctype.contains("PCS")) {
                role = "procedure";
            } else if (ctype.startsWith("ICD-10")) {
                role = firstIcd10 ? "principal_diagnosis" : "secondary_diagnosis";
                firstIcd10 = false;
            } else {
                role = "other";
            }

            coding.insertCaseCode(tn, icdId, role, "coder_assigned", null, uid, now);
            bump(stats, "coder_codes_created");
            written++;
        }

        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("by", coder);
        detail.put("from", "ui_edits");
        detail.put("codes", written);
        detail.put("at", now);
        coding.insertHistory(tn, uid, "code_assigned", json.writeValueAsString(detail));
    }

    // writeback.py:45 simulate_coder_assignment() — re-confirm the imported
    // principal diagnosis as coder_assigned (idempotent)
    void simulateCoderAssignment(String tn, Integer uid, String coder, String now, Map<String, Integer> stats) {
        if (coding.hasCoderAssigned(tn)) {
            return; // already simulated
        }
        Map<String, Object> row = coding.findImportedPrincipal(tn);
        if (row == null) {
            return; // nothing to confirm
        }
        coding.insertCaseCode(tn, ((Number) row.get("icd_code_id")).intValue(),
                (String) row.get("code_role"), "coder_assigned", null, uid, now);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("by", coder);
        detail.put("simulated", true);
        detail.put("at", now);
        coding.insertHistory(tn, uid, "code_assigned", json.writeValueAsString(detail));
        bump(stats, "coder_codes_created");
    }

    // writeback.py:73 finalize_case() — status + audit trail, then QUEUE the
    // hospital write-back; the queued diff runs after our transaction commits
    void finalizeCase(String tn, String coder, String now, Map<String, Integer> stats, List<ImedOp> ops) {
        Map<String, Object> caseRow = coding.caseRowForFinalize(tn);
        if (caseRow == null) {
            return; // approve() already screens with case_exists, like Flask
        }
        String encountertype = (String) caseRow.get("encountertype");

        // MedCode AI side: workflow status + audit trail
        coding.updateCaseStatus(tn, "approved");
        Map<String, Object> approvedDetail = new LinkedHashMap<>();
        approvedDetail.put("by", coder);
        approvedDetail.put("at", now);
        coding.insertHistory(tn, null, "approved_single", json.writeValueAsString(approvedDetail));

        // Hospital side (queued diff): the coder_assigned set, translated to
        // the iMed API's vocabulary — ImedWritebackService diffs it against
        // the hospital's live rows and edits them in place (2026-07-24)
        List<Map<String, Object>> coderCodes = coding.coderCodes(tn);
        List<ImedWritebackService.TargetCode> targets = new ArrayList<>();
        for (Map<String, Object> cc : coderCodes) {
            boolean procedure = "ICD-9".equals(cc.get("code_system"))
                    || "procedure".equals(cc.get("code_role"));
            targets.add(new ImedWritebackService.TargetCode(
                    procedure ? "icd9" : "icd10",
                    (String) cc.get("code"),
                    (String) cc.get("description"),
                    // reverse Q3 role mapping, ours -> theirs (diagnoses only)
                    procedure ? null
                            : ROLE_TO_DIAGTYPE.getOrDefault((String) cc.get("code_role"), "OTHERS")));
        }
        ops.add(new ImedOp(tn, encountertype, targets, coder, now));
        bump(stats, "status_rows");

        Map<String, Object> exportedDetail = new LinkedHashMap<>();
        exportedDetail.put("to", "iMed");
        exportedDetail.put("status", "approved");
        exportedDetail.put("codes_written", coderCodes.size());
        exportedDetail.put("at", now);
        coding.insertHistory(tn, null, "exported", json.writeValueAsString(exportedDetail));
        bump(stats, "cases_finalized");
    }

    // app.py:337 reopen_case_rows() — reverse an approve on our side and QUEUE
    // the hospital-side revert; case_code_edits / case_report_drafts are KEPT
    // (coder's work survives)
    void reopenCaseRows(String caseId, String coder, List<ImedOp> ops) {
        Map<String, Object> caseRow = coding.caseRowForFinalize(caseId);
        String encountertype = caseRow == null ? "0" : (String) caseRow.get("encountertype");
        coding.updateCaseStatus(caseId, "open");
        coding.deleteCoderAssigned(caseId);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("by", coder);
        detail.put("at", nowStr());
        coding.insertHistory(caseId, null, "reopened", json.writeValueAsString(detail));
        ops.add(new ImedOp(caseId, encountertype, null, coder, nowStr()));
    }

    /** Run the queued hospital actions, in order, after our commit (still
     *  inside the WriteGate lock). A failure here 500s the request with our
     *  side committed — re-approve / re-reopen heals (the diff recomputes
     *  against live hospital state). Returns total hospital code writes. */
    private int runImedOps(List<ImedOp> ops) {
        int writes = 0;
        for (ImedOp op : ops) {
            if (op.targets() == null) {
                writeback.reopenCase(op.tn(), op.encountertype(), op.now());
            } else {
                writes += writeback.approveCase(op.tn(), op.encountertype(), op.targets(),
                        op.coder(), op.now());
            }
        }
        return writes;
    }

    // Python truthiness for JSON values (e.get("missing") checks)
    private static boolean jsTruthy(Object v) {
        if (v == null) {
            return false;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof String s) {
            return !s.isEmpty();
        }
        if (v instanceof Number n) {
            return n.doubleValue() != 0;
        }
        if (v instanceof Collection<?> c) {
            return !c.isEmpty();
        }
        if (v instanceof Map<?, ?> m) {
            return !m.isEmpty();
        }
        return true;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
