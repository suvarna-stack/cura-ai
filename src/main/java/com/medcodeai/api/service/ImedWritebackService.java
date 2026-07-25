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
 * → one POST (which also carries the required medical-discharge object —
 * placeholder master-data ids until the hospital answers open question 3 in
 * docs/imed-integration.md). Every touched row is journaled in
 * imed_write_ops with its before-image. Order is cancel → update → create,
 * so a created code can never collide (409) with a row queued for cancel.
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

    /** One finalized code the hospital should hold after approve. */
    public record TargetCode(String kind, String code, String name, String diagnosisType) {
    }

    private final ImedApiClient imed;
    private final ImedWriteOpsRepository ops;
    private final JsonMapper json = new JsonMapper();

    public ImedWritebackService(ImedApiClient imed, ImedWriteOpsRepository ops) {
        this.imed = imed;
        this.ops = ops;
    }

    // ---- approve ------------------------------------------------------------

    /** Applies the diff and coding status; returns hospital code writes made. */
    public int approveCase(String tn, String encountertype, List<TargetCode> targets,
            String coder, String now) {
        int writes = 0;
        writes += diffKind(tn, "icd10", liveRows(tn, "icd10"), targets, encountertype, coder, now);
        writes += diffKind(tn, "icd9", liveRows(tn, "icd9"), targets, encountertype, coder, now);

        Map<String, Object> status = new LinkedHashMap<>();
        status.put("request_id", rid(tn));
        status.put("coding_status", "approved");
        status.put("finalized_at", now);
        status.put("updated_by", coder);
        imed.putCodingStatus(tn, status);
        return writes;
    }

    private int diffKind(String tn, String kind, List<Map<String, Object>> live,
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
            imed.putDiagnosis(tn, putBody(tn, kind, updates, updateBefore, encountertype));
            writes += updates.size();
        }
        // creates last (POST) — journaled after, we need the generated ids
        if (!creates.isEmpty()) {
            Map<String, Object> resp = imed.postDiagnosis(
                    postBody(tn, kind, creates, encountertype, coder));
            for (Map<String, Object> created : createdRows(resp, kind)) {
                ops.insertOp(tn, "created", kind, str(created.get("object_id")), null, now);
            }
            writes += creates.size();
        }
        return writes;
    }

    // ---- reopen -------------------------------------------------------------

    /** Reverts the journal against live state, clears status, clears journal. */
    public void reopenCase(String tn, String encountertype, String now) {
        List<Map<String, Object>> journal = ops.opsForCase(tn);

        for (String kind : List.of("icd10", "icd9")) {
            List<Map<String, Object>> live = journal.isEmpty() ? List.of() : liveRows(tn, kind);
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
                                    List.of(original), List.of(before), encountertype));
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
                imed.postDiagnosis(postBody(tn, kind, recreates, encountertype, "medcode.reopen"));
            }
        }

        imed.deleteCodingStatus(tn);
        ops.clearCase(tn);
    }

    // ---- body builders ------------------------------------------------------

    private Map<String, Object> postBody(String tn, String kind, List<TargetCode> codes,
            String encountertype, String coder) {
        Map<String, Object> body = visitEnvelope(tn, encountertype);
        List<Map<String, Object>> icd10 = new ArrayList<>();
        List<Map<String, Object>> icd9 = new ArrayList<>();
        for (TargetCode t : codes) {
            if ("icd10".equals(kind)) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("icd10_code", t.code());
                putName(r, "icd10_description", "beginning_diagnosis", t.name());
                r.put("fix_diagnosis_type_id", t.diagnosisType());
                r.put("fix_dx_source", "MED_DC");
                r.put("coder_eid", coder);
                icd10.add(r);
            } else {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("icd9_code", t.code());
                putName(r, "icd9_description", "beginning_operation", t.name());
                // placeholder until the hospital's master data arrives (open q.2)
                r.put("fix_operation_type_id", "GENERAL_OPERATION");
                r.put("is_from", "MED_DC");
                icd9.add(r);
            }
        }
        body.put("diagnosis_icd10", icd10);
        body.put("diagnosis_icd9", icd9);
        // POST requires the visit-type-matching discharge object; placeholder
        // master-data ids until open question 3 (discharge coupling) is answered
        if ("0".equals(encountertype)) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("fix_opd_discharge_status_id", "OPD_DISCHARGE_STATUS_ID");
            body.put("doctor_discharge_opd", d);
        } else {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("fix_ipd_discharge_status_id", "IPD_DISCHARGE_STATUS_ID");
            d.put("fix_ipd_discharge_type_id", "IPD_DISCHARGE_TYPE_ID");
            d.put("is_from", "MED_DC");
            body.put("doctor_discharge_ipd", d);
        }
        return body;
    }

    private Map<String, Object> putBody(String tn, String kind, List<TargetCode> targets,
            List<Map<String, Object>> beforeRows, String encountertype) {
        Map<String, Object> body = visitEnvelope(tn, encountertype);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < targets.size(); i++) {
            TargetCode t = targets.get(i);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("object_id", str(beforeRows.get(i).get("id")));
            if ("icd10".equals(kind)) {
                r.put("icd10_code", t.code());
                putName(r, "icd10_description", "beginning_diagnosis", t.name());
                r.put("fix_diagnosis_type_id", t.diagnosisType());
            } else {
                r.put("icd9_code", t.code());
                putName(r, "icd9_description", "beginning_operation", t.name());
            }
            rows.add(r);
        }
        body.put("icd10".equals(kind) ? "diagnosis_icd10" : "diagnosis_icd9", rows);
        return body;
    }

    private Map<String, Object> visitEnvelope(String tn, String encountertype) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("request_id", rid(tn));
        body.put("object_id", tn);
        body.put("fix_visit_type_id", "0".equals(encountertype) ? "OPD" : "IPD");
        body.put("doctor_discharge", "1");
        return body;
    }

    private static void putName(Map<String, Object> r, String descKey, String nameKey, String name) {
        if (name != null && !name.isBlank()) {
            r.put(descKey, name);
            r.put(nameKey, name);
        }
    }

    // ---- diff helpers -------------------------------------------------------

    /** Change detection: code matched by key; name only when we HAVE one
     *  (never blank the hospital's), diagnosistype for ICD-10 only. */
    private static boolean differs(String kind, TargetCode t, Map<String, Object> liveRow) {
        String liveName = str(liveRow.get("name"));
        if (t.name() != null && !t.name().isBlank() && !t.name().equals(liveName)) {
            return true;
        }
        if ("icd10".equals(kind) && t.diagnosisType() != null
                && !t.diagnosisType().equals(str(liveRow.get("diagnosistype")))) {
            return true;
        }
        return false;
    }

    private static TargetCode targetFromRow(String kind, Map<String, Object> row) {
        return new TargetCode(kind, str(row.get("icd")), str(row.get("name")),
                str(row.get("diagnosistype")));
    }

    private List<Map<String, Object>> liveRows(String tn, String kind) {
        return "icd10".equals(kind) ? imed.diagnoses(tn) : imed.procedures(tn);
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
