package com.medcodeai.api.service;

import com.medcodeai.api.client.ImedApiClient;
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
 * database only) -> hospital HTTP calls (ImedApiClient) -> unlock -> cache
 * invalidate. The hospital ops are QUEUED while the transaction runs and sent
 * only after it commits — the same order as the Flask reference's
 * mc.commit()-then-imed.commit(). If a hospital call fails the request 500s
 * with our side already committed; finalize and reopen are idempotent on both
 * sides, so re-approving / re-reopening heals (Flask's crash-healing
 * property, now across the HTTP boundary).
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
    private final ImedApiClient imed;
    private final WorkingStateRepository workingState;
    private final WriteGate writeGate;
    private final CasesCache cache;
    private final TransactionTemplate tx;
    private final JsonMapper json = new JsonMapper();

    /** One queued hospital call; a null putBody means DELETE (reopen). */
    private record ImedOp(String tn, Map<String, Object> putBody) {
    }

    public ApprovalService(CasesRepository cases, CodingRepository coding, ImedApiClient imed,
                           WorkingStateRepository workingState, WriteGate writeGate, CasesCache cache,
                           PlatformTransactionManager txManager) {
        this.cases = cases;
        this.coding = coding;
        this.imed = imed;
        this.workingState = workingState;
        this.writeGate = writeGate;
        this.cache = cache;
        this.tx = new TransactionTemplate(txManager);
    }

    // app.py:118 now_str()
    public static String nowStr() {
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    // app.py:299 approve() — response {ok, approved, notFound, stats}
    public Map<String, Object> approve(List<String> ids, String coder) {
        Map<String, Object> result = writeGate.locked(() -> {
            List<ImedOp> ops = new ArrayList<>();
            Map<String, Object> out = tx.execute(status -> {
                String now = nowStr();
                Map<String, Integer> stats = newStats();
                Integer uid = ensureDemoCoder(coder);
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
            runImedOps(ops); // after our commit — Flask's two-commit order
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
    // limited hospital write-back (one PUT: A11 status + MCAI-prefixed codes);
    // the queued call is sent after our transaction commits
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

        // Hospital side (queued PUT): the coder_assigned set, translated into
        // iMed vocabulary here — the hospital stores what it receives verbatim
        List<Map<String, Object>> coderCodes = coding.coderCodes(tn);
        List<Map<String, Object>> codes = new ArrayList<>();
        for (Map<String, Object> cc : coderCodes) {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("id", "MCAI-" + cc.get("case_code_id"));
            c.put("icd", cc.get("code"));
            c.put("name", cc.get("description"));
            if ("ICD-9".equals(cc.get("code_system")) || "procedure".equals(cc.get("code_role"))) {
                c.put("type", "procedure");
            } else {
                c.put("type", "diagnosis");
                // reverse Q3 role mapping, ours -> theirs
                c.put("diagnosisType", ROLE_TO_DIAGTYPE.getOrDefault((String) cc.get("code_role"), "OTHERS"));
            }
            codes.add(c);
            bump(stats, "mcai_code_rows");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "approved");
        body.put("finalizedAt", now);
        body.put("updatedBy", coder);
        body.put("encounterType", encountertype);
        body.put("codes", codes);
        ops.add(new ImedOp(tn, body));
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
    // the hospital-side clear; case_code_edits / case_report_drafts are KEPT
    // (coder's work survives)
    void reopenCaseRows(String caseId, String coder, List<ImedOp> ops) {
        coding.updateCaseStatus(caseId, "open");
        coding.deleteCoderAssigned(caseId);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("by", coder);
        detail.put("at", nowStr());
        coding.insertHistory(caseId, null, "reopened", json.writeValueAsString(detail));
        ops.add(new ImedOp(caseId, null));
    }

    /** Send the queued hospital calls, in order, after our commit (still
     *  inside the WriteGate lock). A failure here 500s the request with our
     *  side committed — re-approve / re-reopen heals (both are idempotent). */
    private void runImedOps(List<ImedOp> ops) {
        for (ImedOp op : ops) {
            if (op.putBody() == null) {
                imed.deleteCodingResult(op.tn());
            } else {
                imed.putCodingResult(op.tn(), op.putBody());
            }
        }
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
