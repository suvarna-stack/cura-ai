package com.medcodeai.api.service;

import com.medcodeai.api.repo.CasesRepository;
import com.medcodeai.api.repo.CodingRepository;
import com.medcodeai.api.repo.ImedWritebackRepository;
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
 * The approval workflow: approve (materialize edits + finalize + iMed
 * write-back) and reopen. Ported from server/app.py + sync/writeback.py.
 *
 * Structure per write request: WriteGate lock -> ONE DB transaction -> unlock
 * -> cache invalidate. Both schemas live in one Postgres DB, so unlike
 * Flask's two commits the whole write is atomic — the one allowed
 * improvement; every row written is identical. finalize stays idempotent
 * (Flask's crash-healing property).
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
    private final ImedWritebackRepository imed;
    private final WorkingStateRepository workingState;
    private final WriteGate writeGate;
    private final CasesCache cache;
    private final TransactionTemplate tx;
    private final JsonMapper json = new JsonMapper();

    public ApprovalService(CasesRepository cases, CodingRepository coding, ImedWritebackRepository imed,
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
        Map<String, Object> result = writeGate.locked(() -> tx.execute(status -> {
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
                finalizeCase(tn, coder, now, stats);
                approved.add(tn);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("approved", approved);
            out.put("notFound", notFound);
            out.put("stats", stats);
            return out;
        }));
        cache.invalidate();
        return result;
    }

    // app.py:360 reopen()
    public Map<String, Object> reopen(String caseId, String coder) {
        writeGate.locked(() -> tx.execute(status -> {
            if (!cases.caseExists(caseId)) {
                throw new ApiExceptionHandler.NotFoundException();
            }
            reopenCaseRows(caseId, coder);
            return null;
        }));
        cache.invalidate();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
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

    // writeback.py:73 finalize_case() — status + audit trail, then the limited
    // iMed write-back (A11 status row + MCAI-prefixed code rows)
    void finalizeCase(String tn, String coder, String now, Map<String, Integer> stats) {
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

        // Write-back 1: case coding/audit status -> A11 (upsert)
        imed.deleteCodingStatus(tn);
        imed.insertCodingStatus(tn, "approved", now, coder);
        bump(stats, "status_rows");

        // Write-back 2: finalized ICD codes (coder_assigned only, marked MCAI-)
        imed.deleteMcaiCodeRows(tn);
        List<Map<String, Object>> coderCodes = coding.coderCodes(tn);
        for (Map<String, Object> cc : coderCodes) {
            String ref = "MCAI-" + cc.get("case_code_id");
            if ("ICD-9".equals(cc.get("code_system")) || "procedure".equals(cc.get("code_role"))) {
                imed.insertProcedureRow(tn, encountertype, ref,
                        (String) cc.get("description"), (String) cc.get("code"));
            } else {
                imed.insertDiagnosisRow(tn, encountertype, ref,
                        (String) cc.get("description"), (String) cc.get("code"),
                        ROLE_TO_DIAGTYPE.getOrDefault((String) cc.get("code_role"), "OTHERS"));
            }
            bump(stats, "mcai_code_rows");
        }

        Map<String, Object> exportedDetail = new LinkedHashMap<>();
        exportedDetail.put("to", "iMed");
        exportedDetail.put("status", "approved");
        exportedDetail.put("codes_written", coderCodes.size());
        exportedDetail.put("at", now);
        coding.insertHistory(tn, null, "exported", json.writeValueAsString(exportedDetail));
        bump(stats, "cases_finalized");
    }

    // app.py:337 reopen_case_rows() — reverse an approve in both schemas;
    // case_code_edits / case_report_drafts are KEPT (coder's work survives)
    void reopenCaseRows(String caseId, String coder) {
        coding.updateCaseStatus(caseId, "open");
        coding.deleteCoderAssigned(caseId);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("by", coder);
        detail.put("at", nowStr());
        coding.insertHistory(caseId, null, "reopened", json.writeValueAsString(detail));
        imed.deleteCodingStatus(caseId);
        imed.deleteMcaiCodeRows(caseId);
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
