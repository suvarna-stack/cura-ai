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

    // the frontend's isIcd9Type / systemFromCodeType regexes, mirrored — the
    // UI stores role-bearing `type` labels and these are the shared rule for
    // which catalog such a label means
    private static final java.util.regex.Pattern ICD9_TYPE =
            java.util.regex.Pattern.compile("(?i)icd[- ]?9|pcs");
    private static final java.util.regex.Pattern ICD10_TYPE =
            java.util.regex.Pattern.compile("(?i)icd[- ]?10");

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
                List<String> blocked = new ArrayList<>();
                for (String tn : ids) {
                    if (!cases.caseExists(tn)) {
                        notFound.add(tn);
                        continue;
                    }
                    // A case is coded when BOTH halves are answered — a
                    // diagnosis AND a procedure (or the coder's explicit "no
                    // procedure"). Decided BEFORE anything is written, so a
                    // half-coded case is skipped whole rather than
                    // half-approved.
                    Picks picks = effectiveCodes(tn);
                    if (!coversBothSystems(picks)) {
                        blocked.add(tn);
                        continue;
                    }
                    writePicks(tn, picks, uid, coder, now, stats);
                    finalizeCase(tn, coder, now, stats, ops);
                    approved.add(tn);
                }
                Map<String, Object> o = new LinkedHashMap<>();
                o.put("ok", true);
                o.put("approved", approved);
                o.put("notFound", notFound);
                // cases that need a code in both columns before they can be
                // approved — the caller un-approves these and says so
                o.put("blocked", blocked);
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

    // The old approvals-replay demo reset (run_demo era) is gone — demo state
    // restore is DemoBaselineService's whole-database snapshot/reset now.

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
    /**
     * What an approve would write for this case: the codes the coder ticked,
     * or — when the case is being approved from the LIST, where nothing can be
     * ticked because the case was never opened — the codes that stand in for
     * that decision.
     *
     * Auto-pick, per system, and only into a system with NOTHING ticked:
     *   * the hospital's own codes, if it sent any (the Complete tab: iMed
     *     already carries both a diagnosis and a procedure);
     *   * otherwise a lone candidate, if there is exactly ONE (the Incomplete
     *     tab, where the AI filled the empty column with a single prediction).
     * Two or more candidates and no hospital code is a real choice, and a
     * choice belongs to the coder — the case is left for them to open.
     *
     * An explicitly unticked code is NEVER auto-picked back: rejecting a
     * suggestion is a decision too.
     */
    Picks effectiveCodes(String tn) {
        String payload = workingState.loadEditsPayload(tn);
        if (payload == null) {
            // never opened, nothing saved: the hospital's codes are the pick
            return new Picks(List.of(), coding.importedCodes(tn), false);
        }
        List<?> parsedEntries;
        try {
            Object parsed = json.readValue(payload, Object.class);
            parsedEntries = parsed instanceof List<?> l ? l : List.of();
        } catch (RuntimeException e) {
            parsedEntries = List.of();
        }

        boolean noProcedure = false;
        boolean anyFlagged = false;     // payload predates the checkbox if false
        List<Map<String, Object>> ticked = new ArrayList<>();
        List<Map<String, Object>> candidates = new ArrayList<>();
        List<Map<String, Object>> rejected = new ArrayList<>();
        for (Object o : parsedEntries) {
            if (!(o instanceof Map<?, ?> raw)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> e = (Map<String, Object>) raw;
            if (jsTruthy(e.get("noProcedure"))) {
                noProcedure = true;      // the coder said this visit had none
                continue;
            }
            if (jsTruthy(e.get("missing"))) {
                continue;                // unresolved "???" placeholder
            }
            String code = Py.or_(str(e.get("code")), "").strip();
            if (code.isEmpty() || code.equals("???")) {
                continue;
            }
            candidates.add(e);
            if (e.containsKey("selected")) {
                anyFlagged = true;
                if (jsTruthy(e.get("selected"))) {
                    ticked.add(e);
                } else {
                    rejected.add(e);
                }
            }
        }
        // A payload saved before the checkbox existed carries no flag at all:
        // it approves wholesale, exactly as it always did.
        if (!anyFlagged) {
            return new Picks(candidates, List.of(), noProcedure);
        }

        List<Map<String, Object>> picks = new ArrayList<>(ticked);
        for (boolean nine : new boolean[]{false, true}) {
            if (picks.stream().anyMatch(e -> isNine(e) == nine)) {
                continue;                        // this column is answered
            }
            if (nine && noProcedure) {
                continue;                        // answered by the statement
            }
            List<Map<String, Object>> open = candidates.stream()
                    .filter(e -> isNine(e) == nine && !containsRef(rejected, e))
                    .toList();
            List<Map<String, Object>> hospital = open.stream()
                    .filter(e -> "hospital".equals(str(e.get("origin"))))
                    .toList();
            if (!hospital.isEmpty()) {
                picks.addAll(hospital);
            } else if (open.size() == 1) {
                picks.addAll(open);
            }
        }
        // keep the payload's order — the first ICD-10 is the principal
        List<Map<String, Object>> ordered = candidates.stream()
                .filter(e -> containsRef(picks, e)).toList();
        return new Picks(ordered, List.of(), noProcedure);
    }

    /** Reference equality, deliberately: two rows can be value-identical and
     *  still be different picks — one ticked, one not. */
    private static boolean containsRef(List<Map<String, Object>> list, Map<String, Object> e) {
        for (Map<String, Object> x : list) {
            if (x == e) {
                return true;
            }
        }
        return false;
    }

    /** Which column an entry belongs to, by the frontend's own rule. */
    private static boolean isNine(Map<String, Object> e) {
        return ICD9_TYPE.matcher(Py.or_(str(e.get("type")), "ICD-10").strip()).find();
    }

    /**
     * A case may only be approved once BOTH halves are answered: a diagnosis
     * and a procedure — or, for a visit that had no operation, the coder's
     * explicit "no procedure was performed". Half a code set is an unfinished
     * case, and finalizing one hides that fact from the audit.
     */
    boolean coversBothSystems(Picks picks) {
        boolean ten = picks.entries().stream().anyMatch(e -> !isNine(e))
                || picks.imported().stream().anyMatch(r -> "ICD-10".equals(str(r.get("code_system"))));
        boolean nine = picks.noProcedure()
                || picks.entries().stream().anyMatch(ApprovalService::isNine)
                || picks.imported().stream().anyMatch(r -> "ICD-9".equals(str(r.get("code_system"))));
        return ten && nine;
    }

    /** The codes an approve will write, and how they were arrived at. */
    record Picks(List<Map<String, Object>> entries,
                 List<Map<String, Object>> imported,
                 boolean noProcedure) {}

    void writePicks(String tn, Picks picks, Integer uid, String coder, String now,
                    Map<String, Integer> stats) {
        // replace, don't append: re-approving after new edits must not duplicate
        coding.deleteCoderAssigned(tn);
        if (picks.entries().isEmpty()) {
            confirmImportedCodes(tn, picks.imported(), uid, coder, now, stats);
            return;
        }
        boolean firstIcd10 = true;
        int written = 0;
        for (Map<String, Object> e : picks.entries()) {
            String code = Py.or_(str(e.get("code")), "").strip();
            if (code.isEmpty() || code.equals("???")) {
                continue;
            }
            String ctype = Py.or_(str(e.get("type")), "ICD-10").strip();
            String desc = Py.or_(str(e.get("desc")), "");

            // The UI's `type` vocabulary is looser than the two catalog labels —
            // its Add/Edit dialogs store role-bearing strings ("ICD-9 Primary
            // Diagnosis", "Comorbidities", "ICD-10 Comorbidity"). Mirror the
            // frontend's own column rule (isIcd9Type: /icd[- ]?9|pcs/i → ICD-9,
            // everything else ICD-10) so a saved edit resolves to a catalog
            // instead of 500ing the approve on IcdSystem.of.
            boolean nine = ICD9_TYPE.matcher(ctype).find();
            String system = nine ? "ICD-9" : "ICD-10";

            Integer icdId = coding.findIcdCodeId(code, system);
            if (icdId == null) {
                icdId = coding.insertIcdCode(code, system, desc);
            }

            // [POC] StoredCode carries no explicit role; derive one from the
            // label: procedures by system; "…external…" = external cause of
            // injury and "…other…" = other (the two dropdown options added
            // 2026-07-30 for hospital-UI parity — sync and the write-back
            // already speak both); "…comorbid…" = secondary; otherwise first
            // ICD-10 = principal, other ICD-10 secondary
            String role;
            String lower = ctype.toLowerCase();
            if (nine) {
                role = "procedure";
            } else if (lower.contains("external")) {
                role = "external_cause";
            } else if (lower.contains("comorbid")) {
                role = "secondary_diagnosis";
            } else if (lower.contains("other")) {
                role = "other";
            } else if (ICD10_TYPE.matcher(ctype).find()) {
                role = firstIcd10 ? "principal_diagnosis" : "secondary_diagnosis";
                firstIcd10 = false;
            } else {
                role = "other";
            }

            coding.insertCaseCode(tn, system, icdId, role, "coder_assigned", null, uid, now,
                    opTime(e.get("operation_start")), opTime(e.get("operation_end")),
                    blankToNull(str(e.get("operation_type"))));
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

    /**
     * Confirm the hospital's own codes as the coder's, roles and operation
     * window intact. This is the list-approve path for a case nobody opened:
     * ticking every imported code by hand would produce exactly these rows.
     * Falls back to the principal-only simulate when iMed sent nothing.
     */
    void confirmImportedCodes(String tn, List<Map<String, Object>> imported, Integer uid,
                              String coder, String now, Map<String, Integer> stats) {
        if (imported.isEmpty()) {
            simulateCoderAssignment(tn, uid, coder, now, stats);
            return;
        }
        int written = 0;
        for (Map<String, Object> r : imported) {
            Object id = r.get("icd_code_id");
            if (!(id instanceof Number n)) {
                continue;
            }
            coding.insertCaseCode(tn, str(r.get("code_system")), n.intValue(),
                    str(r.get("code_role")), "coder_assigned", null, uid, now,
                    opTime(r.get("operation_start")), opTime(r.get("operation_end")),
                    blankToNull(str(r.get("operation_type"))));
            bump(stats, "coder_codes_created");
            written++;
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("by", coder);
        detail.put("from", "hospital_codes");
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
        coding.insertCaseCode(tn, (String) row.get("code_system"),
                ((Number) row.get("icd_code_id")).intValue(),
                (String) row.get("code_role"), "coder_assigned", null, uid, now, null, null, null);
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
                            : ROLE_TO_DIAGTYPE.getOrDefault((String) cc.get("code_role"), "OTHERS"),
                    // operation window + type (procedures only; null on
                    // diagnoses by schema)
                    (String) cc.get("operation_start"),
                    (String) cc.get("operation_end"),
                    (String) cc.get("operation_type")));
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
     *  inside the WriteGate lock). A failure here 502s the request, with the
     *  hospital's error as the message and our side committed — re-approve / re-reopen heals (the diff recomputes
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

    /** A CodeEdit operation_start/end value normalized to "YYYY-MM-DD HH:MM:SS"
     *  (the UI's datetime-local sends "YYYY-MM-DDTHH:MM"); garbage → null, in
     *  the same silent-degrade spirit as the rest of the edit parsing. */
    private static String opTime(Object v) {
        String s = str(v);
        return s == null ? null : SyncRules.parseDt(s.replace('T', ' '));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
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
