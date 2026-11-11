package com.medcodeai.api.service;

import com.medcodeai.api.client.ImedApiClient;
import com.medcodeai.api.repo.ImedWriteOpsRepository;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The diff-based hospital write-back (2026-07-24) — replaces the wholesale
 * MCAI-row replace with the real iMed API's row-level model.
 *
 * APPROVE: the coder's finalized code set is diffed against the hospital's
 * LIVE rows (fetched through the extract reads, which exclude cancelled
 * rows). Removed codes → DELETE (cancel), changed codes → one PUT, new codes
 * → one POST (which also carries the required medical-discharge object — its
 * status id is DISCHARGE_STATUS_ID below, the rest placeholder until the
 * hospital answers open question 3 in docs/imed-integration.md). Every touched row is journaled in
 * imed_write_ops with its before-image. Order is cancel → update → create,
 * so a created code can never collide (409) with a row queued for cancel.
 *
 * Both directions also carry the visit's coding status (CODING_APPROVED /
 * CODING_OPEN below) on the bodies they already send, falling back to one
 * body-less PUT when the diff had nothing to say — so the hospital always
 * ends up agreeing with our cases.case_status.
 *
 * REOPEN: the revert plan is the journal replayed against live state — rows
 * we created get cancelled, rows we updated get PUT back to their
 * before-image, rows we cancelled get re-created (new object_ids; iMed has
 * no un-cancel). The journal is cleared only after the full revert.
 *
 * Idempotency/healing: both directions recompute the diff against live
 * hospital state, so a retry after a mid-flight failure converges instead of
 * double-writing — the request_id dedup on the hospital side is a second
 * belt for network retries. Known gap (documented): a crash between a POST
 * and journaling its created ids leaves hospital rows the reopen plan cannot
 * attribute; the retry-diff will match them by code so approve heals, but
 * reopen would keep them.
 *
 * Only rows with a non-blank ICD code are managed; code-less hospital rows
 * (some extract procedures) are never touched.
 */
@Service
public class ImedWritebackService {

    /** One finalized code the hospital should hold after approve. start/end
     *  are the operation window ("YYYY-MM-DD HH:MM:SS") and opType the
     *  extract-vocabulary operation type ("OR Procedure" …), icd9 only. */
    public record TargetCode(String kind, String code, String name, String diagnosisType,
            String start, String end, String opType) {
    }

    /**
     * The discharge status id every approve sends (OPD and IPD alike), because
     * the POST contract requires a discharge object. The hospital's real
     * master-data ids are still open question 3 in docs/imed-integration.md,
     * so this is ours to choose until they answer. "Coding Approved" says what
     * actually happened (a coder signed off the codes) and can't be mistaken
     * for one of the hospital's clinical outcomes ("Improved", "Not Improved",
     * …), which are the doctor's to set. Since 2026-08-07 it stays INSIDE the
     * discharge object — the visit row is marked by CODING_APPROVED above
     * instead. IMED_DISCHARGE_STATUS_ID overrides it — that's where the
     * hospital's id slots in, no code change.
     */
    private static final String DISCHARGE_STATUS_ID = envOr("IMED_DISCHARGE_STATUS_ID",
            "Coding Approved");

    /**
     * The coding-status extension (2026-08-07): the visit's coding workflow
     * state on the hospital side — our cases.case_status, mirrored where the
     * hospital can see it. It rides the `coding_status` field of the diagnosis
     * POST/PUT we already send, so codes and status land in one hospital
     * transaction; iMed stores it on medhack_patient.coding_status.
     *
     * This replaces the old marker, which overwrote the visit's
     * dischargestatus — the DOCTOR's clinical outcome, never ours to set. The
     * discharge object below still goes out (the POST contract requires one),
     * but it no longer projects onto the visit row.
     *
     * Proposed by us and ACCEPTED: the hospital's Medihack API guide (4 Nov
     * 2026) lists coding_status ("approved" / "open") as an optional field on
     * POST and PUT, and a status-only PUT as a supported request. Its read side
     * still serves visit.coding_status as null (no confirmed mapping yet).
     */
    private static final String CODING_APPROVED = "approved";
    /** The reserved word that clears it again on reopen. */
    private static final String CODING_OPEN = "open";

    /** IPD-only companion, unused by the discharge object's storage; still the
     *  placeholder until the hospital's discharge-type master data arrives. */
    private static final String DISCHARGE_TYPE_ID = envOr("IMED_DISCHARGE_TYPE_ID",
            "IPD_DISCHARGE_TYPE_ID");

    private final ImedApiClient imed;
    private final ImedWriteOpsRepository ops;
    private final JsonMapper json = new JsonMapper();

    private static String envOr(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }

    public ImedWritebackService(ImedApiClient imed, ImedWriteOpsRepository ops) {
        this.imed = imed;
        this.ops = ops;
    }

    // ---- approve ------------------------------------------------------------

    /** Applies the code diff and marks the visit coded; returns hospital code
     *  writes made. */
    public int approveCase(String tn, String encountertype, List<TargetCode> targets,
            String coder, String now) {
        Map<String, Object> live = liveCase(tn);   // one R2 call, both blocks
        DiffResult a = diffKind(tn, "icd10", liveRows(live, "icd10"), targets, encountertype, coder, now);
        DiffResult b = diffKind(tn, "icd9", liveRows(live, "icd9"), targets, encountertype, coder, now);
        if (!a.bodySent() && !b.bodySent()) {
            sendCodingStatus(tn, encountertype, CODING_APPROVED);
        }
        return a.writes() + b.writes();
    }

    /** What one kind's diff did: hospital code writes, and whether any of them
     *  was a POST/PUT — the calls that carry the coding status. Cancels are
     *  DELETEs with no body, so they write rows without marking the visit. */
    private record DiffResult(int writes, boolean bodySent) {
    }

    private DiffResult diffKind(String tn, String kind, List<Map<String, Object>> live,
            List<TargetCode> allTargets, String encountertype, String coder, String now) {
        // first occurrence wins on duplicate codes — the hospital enforces
        // uniqueness per visit (409), so a doubled coder entry must not POST twice
        Map<String, TargetCode> byCode = new LinkedHashMap<>();
        for (TargetCode t : allTargets) {
            if (kind.equals(t.kind()) && t.code() != null && !t.code().isBlank()) {
                byCode.putIfAbsent(t.code(), t);
            }
        }
        List<TargetCode> targets = List.copyOf(byCode.values());

        // index live rows by code (the 409 rule keeps live codes unique per visit)
        Map<String, Map<String, Object>> liveByCode = new LinkedHashMap<>();
        for (Map<String, Object> row : live) {
            String icd = str(row.get("icd"));
            if (icd != null && !icd.isBlank()) {
                liveByCode.putIfAbsent(icd, row);
            }
        }

        List<TargetCode> creates = new ArrayList<>();
        List<TargetCode> updates = new ArrayList<>();
        List<Map<String, Object>> updateBefore = new ArrayList<>();
        for (TargetCode t : targets) {
            Map<String, Object> row = liveByCode.remove(t.code());
            if (row == null) {
                creates.add(t);
            } else if (differs(kind, t, row)) {
                updates.add(t);
                updateBefore.add(row);
            }
        }
        // whatever's left live isn't in the finalized set → cancel first
        int writes = 0;
        boolean bodySent = false;
        for (Map<String, Object> row : liveByCode.values()) {
            String objectId = str(row.get("id"));
            ops.insertOp(tn, "cancelled", kind, objectId, json.writeValueAsString(row), now);
            imed.cancelDiagnosis(tn, kindPath(kind), objectId);
            writes++;
        }
        // then edits (one PUT), journaled before the call — an unapplied journal
        // entry is harmless because reopen re-checks live state
        if (!updates.isEmpty()) {
            for (Map<String, Object> before : updateBefore) {
                ops.insertOp(tn, "updated", kind, str(before.get("id")),
                        json.writeValueAsString(before), now);
            }
            imed.putDiagnosis(tn, putBody(tn, kind, updates, updateBefore, encountertype,
                    CODING_APPROVED));
            writes += updates.size();
            bodySent = true;
        }
        // creates last (POST) — journaled after, we need the generated ids
        if (!creates.isEmpty()) {
            Map<String, Object> resp = imed.postDiagnosis(
                    postBody(tn, kind, creates, encountertype, coder, CODING_APPROVED));
            for (Map<String, Object> created : createdRows(resp, kind)) {
                ops.insertOp(tn, "created", kind, str(created.get("object_id")), null, now);
            }
            writes += creates.size();
            bodySent = true;
        }
        return new DiffResult(writes, bodySent);
    }

    // ---- reopen -------------------------------------------------------------

    /** Reverts the journal against live state, clears the coding status,
     *  clears the journal. */
    public void reopenCase(String tn, String encountertype, String now) {
        List<Map<String, Object>> journal = ops.opsForCase(tn);
        boolean bodySent = false;
        Map<String, Object> liveCase = journal.isEmpty() ? Map.of() : liveCase(tn);

        for (String kind : List.of("icd10", "icd9")) {
            List<Map<String, Object>> live = journal.isEmpty() ? List.of() : liveRows(liveCase, kind);
            Map<String, Map<String, Object>> liveById = new LinkedHashMap<>();
            Map<String, Map<String, Object>> liveByCode = new LinkedHashMap<>();
            for (Map<String, Object> row : live) {
                liveById.put(str(row.get("id")), row);
                String icd = str(row.get("icd"));
                if (icd != null && !icd.isBlank()) {
                    liveByCode.putIfAbsent(icd, row);
                }
            }

            List<TargetCode> recreates = new ArrayList<>();
            for (Map<String, Object> op : journal) {
                if (!kind.equals(op.get("code_kind"))) {
                    continue;
                }
                String objectId = str(op.get("object_id"));
                Map<String, Object> before = readBefore(op);
                switch (str(op.get("op"))) {
                    case "created" -> {
                        if (liveById.containsKey(objectId)) {
                            imed.cancelDiagnosis(tn, kindPath(kind), objectId);
                        }
                    }
                    case "updated" -> {
                        Map<String, Object> row = liveById.get(objectId);
                        TargetCode original = targetFromRow(kind, before);
                        if (row != null && differs(kind, original, row)) {
                            imed.putDiagnosis(tn, putBody(tn, kind,
                                    List.of(original), List.of(before), encountertype, CODING_OPEN));
                            bodySent = true;
                        }
                    }
                    case "cancelled" -> {
                        String icd = str(before.get("icd"));
                        if (icd != null && !liveByCode.containsKey(icd)) {
                            recreates.add(targetFromRow(kind, before));
                        }
                    }
                    default -> throw new IllegalStateException("unknown op " + op.get("op"));
                }
            }
            if (!recreates.isEmpty()) {
                imed.postDiagnosis(postBody(tn, kind, recreates, encountertype, "medcode.reopen",
                        CODING_OPEN));
                bodySent = true;
            }
        }
        // an empty journal (or a revert that needed no body) still has to clear
        // the mark — the visit is back under a coder
        if (!bodySent) {
            sendCodingStatus(tn, encountertype, CODING_OPEN);
        }

        ops.clearCase(tn);
    }

    // ---- body builders ------------------------------------------------------

    private Map<String, Object> postBody(String tn, String kind, List<TargetCode> codes,
            String encountertype, String coder, String codingStatus) {
        Map<String, Object> body = visitEnvelope(tn, encountertype, codingStatus);
        List<Map<String, Object>> icd10 = new ArrayList<>();
        List<Map<String, Object>> icd9 = new ArrayList<>();
        for (TargetCode t : codes) {
            if ("icd10".equals(kind)) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("icd10_code", t.code());
                putName(r, "icd10_description", "beginning_diagnosis", t.name());
                // required on POST, but the hospital serves a type it can't map
                // as null — and reopen re-creates rows from what it served.
                // OTHERS is the same default approve uses for an unknown role.
                r.put("fix_diagnosis_type_id",
                        t.diagnosisType() != null && !t.diagnosisType().isBlank() ? t.diagnosisType() : "OTHERS");
                r.put("fix_dx_source", "MED_DC");
                r.put("coder_eid", coder);
                icd10.add(r);
            } else {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("icd9_code", t.code());
                putName(r, "icd9_description", "beginning_operation", t.name());
                putWindow(r, t);
                // the stored extract-vocabulary type when we hold one;
                // GENERAL_OPERATION stays the placeholder until the hospital's
                // master data arrives (open q.2)
                r.put("fix_operation_type_id",
                        t.opType() != null && !t.opType().isBlank() ? t.opType() : "GENERAL_OPERATION");
                r.put("is_from", "MED_DC");
                icd9.add(r);
            }
        }
        body.put("diagnosis_icd10", icd10);
        body.put("diagnosis_icd9", icd9);
        // POST requires the visit-type-matching discharge object; the status id
        // is DISCHARGE_STATUS_ID (see above — iMed projects it onto the visit
        // row), the rest stays placeholder until open question 3 (discharge
        // coupling) is answered
        if ("0".equals(encountertype)) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("fix_opd_discharge_status_id", DISCHARGE_STATUS_ID);
            body.put("doctor_discharge_opd", d);
        } else {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("fix_ipd_discharge_status_id", DISCHARGE_STATUS_ID);
            d.put("fix_ipd_discharge_type_id", DISCHARGE_TYPE_ID);
            d.put("is_from", "MED_DC");
            body.put("doctor_discharge_ipd", d);
        }
        return body;
    }

    private Map<String, Object> putBody(String tn, String kind, List<TargetCode> targets,
            List<Map<String, Object>> beforeRows, String encountertype, String codingStatus) {
        Map<String, Object> body = visitEnvelope(tn, encountertype, codingStatus);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < targets.size(); i++) {
            TargetCode t = targets.get(i);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("object_id", str(beforeRows.get(i).get("id")));
            if ("icd10".equals(kind)) {
                r.put("icd10_code", t.code());
                putName(r, "icd10_description", "beginning_diagnosis", t.name());
                // the hospital serves diagnosis_type as null when it can't map
                // it, and a PUT field is either a real value or left out — a
                // null would be a 400, and leaving it out keeps the stored type
                if (t.diagnosisType() != null && !t.diagnosisType().isBlank()) {
                    r.put("fix_diagnosis_type_id", t.diagnosisType());
                }
            } else {
                r.put("icd9_code", t.code());
                putName(r, "icd9_description", "beginning_operation", t.name());
                putWindow(r, t);
            }
            rows.add(r);
        }
        body.put("icd10".equals(kind) ? "diagnosis_icd10" : "diagnosis_icd9", rows);
        return body;
    }

    private Map<String, Object> visitEnvelope(String tn, String encountertype, String codingStatus) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("request_id", rid(tn));
        body.put("object_id", tn);
        body.put("fix_visit_type_id", "0".equals(encountertype) ? "OPD" : "IPD");
        body.put("doctor_discharge", "1");
        body.put("coding_status", codingStatus);
        return body;
    }

    /** A PUT carrying nothing but the coding status — the fallback for an
     *  approve whose diff sent no body (nothing changed, or only cancels) and
     *  the way reopen clears the mark. Touches no code row. */
    private void sendCodingStatus(String tn, String encountertype, String codingStatus) {
        imed.putDiagnosis(tn, visitEnvelope(tn, encountertype, codingStatus));
    }

    private static void putName(Map<String, Object> r, String descKey, String nameKey, String name) {
        if (name != null && !name.isBlank()) {
            r.put(descKey, name);
            r.put(nameKey, name);
        }
    }

    /** The operation window, in the API's split shape: "YYYY-MM-DD HH:MM:SS" →
     *  date_in/time_in (start) and date_out/time_out (end). Absent when we have
     *  no value — never blank the hospital's own times (same rule as names). */
    private static void putWindow(Map<String, Object> r, TargetCode t) {
        putSplitDt(r, "date_in", "time_in", t.start());
        putSplitDt(r, "date_out", "time_out", t.end());
    }

    private static void putSplitDt(Map<String, Object> r, String dateKey, String timeKey, String dt) {
        if (dt == null || dt.isBlank()) {
            return;
        }
        int sp = dt.indexOf(' ');
        r.put(dateKey, sp < 0 ? dt : dt.substring(0, sp));
        r.put(timeKey, sp < 0 ? null : dt.substring(sp + 1));
    }

    // ---- diff helpers -------------------------------------------------------

    /** Change detection: code matched by key; name only when we HAVE one
     *  (never blank the hospital's), diagnosistype for ICD-10 only, the
     *  operation window for ICD-9 only (again only when we have a value). */
    private static boolean differs(String kind, TargetCode t, Map<String, Object> liveRow) {
        String liveName = str(liveRow.get("name"));
        if (t.name() != null && !t.name().isBlank() && !t.name().equals(liveName)) {
            return true;
        }
        if ("icd10".equals(kind) && t.diagnosisType() != null
                && !t.diagnosisType().equals(str(liveRow.get("diagnosistype")))) {
            return true;
        }
        if ("icd9".equals(kind)
                && (dtDiffers(t.start(), str(liveRow.get("startdatetime")))
                        || dtDiffers(t.end(), str(liveRow.get("enddatetime"))))) {
            return true;
        }
        return false;
    }

    private static boolean dtDiffers(String ours, String live) {
        return ours != null && !ours.isBlank() && !ours.equals(SyncRules.parseDt(live));
    }

    private static TargetCode targetFromRow(String kind, Map<String, Object> row) {
        return new TargetCode(kind, str(row.get("icd")), str(row.get("name")),
                str(row.get("diagnosistype")),
                SyncRules.parseDt(str(row.get("startdatetime"))),
                SyncRules.parseDt(str(row.get("enddatetime"))),
                str(row.get("operationtype")));
    }

    /**
     * The visit's live code rows, read through the contract's R2 (one call
     * carries both systems). Cancelled rows are already excluded by the
     * hospital, which is what makes the diff safe.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> liveCase(String tn) {
        Object cases = imed.syncCases(List.of(tn)).get("cases");
        if (cases instanceof List<?> l && !l.isEmpty() && l.get(0) instanceof Map<?, ?> c) {
            return (Map<String, Object>) c;
        }
        return Map.of();
    }

    /**
     * One code block, translated back to the EXTRACT's key names (id, icd,
     * name, diagnosistype, startdatetime, …) rather than the contract's.
     *
     * Deliberate: those names are also the shape of the before-images stored in
     * imed_write_ops, and a journal written before 2026-08-19 must stay
     * replayable by a reopen running after it. Translating at this one boundary
     * keeps the diff and the reverse-replay untouched, and keeps old and new
     * journal rows interchangeable.
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> liveRows(Map<String, Object> liveCase, String kind) {
        boolean icd10 = "icd10".equals(kind);
        Object block = liveCase.get(icd10 ? "diagnoses" : "procedures");
        if (!(block instanceof List<?> rows)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : rows) {
            if (!(o instanceof Map<?, ?> m)) {
                continue;
            }
            Map<String, Object> r = (Map<String, Object>) m;
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("id", r.get("object_id"));
            t.put("icd", r.get(icd10 ? "icd10_code" : "icd9_code"));
            t.put("name", r.get("description"));
            if (icd10) {
                t.put("diagnosistype", r.get("diagnosis_type"));
            } else {
                t.put("startdatetime", r.get("operation_start"));
                t.put("enddatetime", r.get("operation_end"));
                t.put("operationtype", r.get("operation_type"));
            }
            out.add(t);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> createdRows(Map<String, Object> envelope, String kind) {
        Object result = envelope == null ? null : envelope.get("result");
        if (!(result instanceof Map<?, ?> r)) {
            return List.of();
        }
        Object rows = r.get("icd10".equals(kind) ? "diagnosis_icd10" : "diagnosis_icd9");
        return rows instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    private Map<String, Object> readBefore(Map<String, Object> op) {
        String beforeJson = str(op.get("before_json"));
        if (beforeJson == null) {
            return Map.of();
        }
        return json.readValue(beforeJson, new TypeReference<LinkedHashMap<String, Object>>() {
        });
    }

    private static String kindPath(String kind) {
        return kind; // journal kinds are already the API's path segments
    }

    /** Fresh per action — convergence comes from re-diffing live state, the
     *  hospital's request_id dedup only guards duplicated network sends. */
    private static String rid(String tn) {
        return "MCAI-" + tn + "-" + UUID.randomUUID();
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
