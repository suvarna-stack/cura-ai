package com.medcodeai.api.service;

import com.medcodeai.api.repo.CasesRepository;
import com.medcodeai.api.repo.UsersRepository;
import com.medcodeai.api.repo.WorkingStateRepository;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Port of sync/views.py build_cases_payload() / build_case_detail().
 * Responses are LinkedHashMaps so key insertion order = the Python dict order
 * (the contract preserves key order; Jackson must not re-sort — see
 * JacksonConfig). "field absent" vs "field null" follows the Python exactly:
 * e.g. `missing` exists only on incomplete-origin rows, `reopened*` only on
 * rows in the reopened queue, finished rows drop confidence/ccpi/cc/pi.
 *
 * Deliberate divergence from the Flask original (2026-07-22): confidence,
 * patient, hn, created_at/updated_at, revenue_impact and coder/coders/
 * reopenedBy no longer come from synthesized placeholder data — they're the
 * real DB values (null where no real value exists yet). Confidence is the
 * average of saved code-edit confidences (RAG suggestions / coder scores)
 * when present. Coder display names resolve from users.full_name so an
 * admin rename (e.g. demo.coder → Peter) shows up on the coder facet and
 * finished cards without rewriting audit stamps.
 */
@Service
public class CasesViewService {

    // views.py:89 MISSING_LABEL — missing-field key -> human label
    private static final Map<String, String> MISSING_LABEL = missingLabels();

    private static Map<String, String> missingLabels() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("chief", "Chief complaint / subjective note");
        m.put("exam", "Physical examination / objective note");
        m.put("assessment", "Assessment / progression note");
        m.put("primary_diagnosis", "Principal diagnosis (ICD-10)");
        m.put("admission_note", "Admission note");
        m.put("discharge_summary", "Discharge / clinical summary");
        return m;
    }

    private final CasesRepository repo;
    private final WorkingStateRepository workingState;
    private final UsersRepository users;
    private final JsonMapper json = new JsonMapper();

    public CasesViewService(CasesRepository repo, WorkingStateRepository workingState,
                            UsersRepository users) {
        this.repo = repo;
        this.workingState = workingState;
        this.users = users;
    }

    // views.py:99 build_cases_payload()
    public Map<String, Object> buildCasesPayload() {
        // views.py:105 — coverage_code -> full reference row
        Map<String, Map<String, Object>> coverage = new HashMap<>();
        for (Map<String, Object> r : repo.coverageTypes()) {
            coverage.put((String) r.get("coverage_code"), r);
        }

        // views.py:111 — case_id -> {fieldname: collapsed 120-char snippet}, first-wins
        Map<String, Map<String, String>> ccpi = new HashMap<>();
        for (Map<String, Object> r : repo.ccpiRows()) {
            Map<String, String> d = ccpi.computeIfAbsent((String) r.get("case_id"), k -> new HashMap<>());
            String fieldname = (String) r.get("fieldname");
            if (!d.containsKey(fieldname)) {
                d.put(fieldname, Py.slice(Py.collapseWs((String) r.get("value")), 120));
            }
        }

        // views.py:121 — case_id -> [{code, system, role}]
        Map<String, List<Map<String, Object>>> codes = new HashMap<>();
        for (Map<String, Object> r : repo.codePreviewRows()) {
            Map<String, Object> chip = new LinkedHashMap<>();
            chip.put("code", r.get("code"));
            chip.put("system", r.get("code_system"));
            chip.put("role", r.get("code_role"));
            codes.computeIfAbsent((String) r.get("case_id"), k -> new ArrayList<>()).add(chip);
        }

        // views.py:130 — case_id -> {category: count}, key order pinned by the SQL CASE
        Map<String, Map<String, Object>> ordcat = new HashMap<>();
        for (Map<String, Object> r : repo.orderCategoryCounts()) {
            ordcat.computeIfAbsent((String) r.get("case_id"), k -> new LinkedHashMap<>())
                    .put((String) r.get("order_category"), r.get("n"));
        }

        // case_id -> {category: [distinct order names A–Z]}, same pinned
        // category order as `orders` — the items behind each count (the
        // frontend's nested Study/Item filter reads this; added 2026-07-27)
        Map<String, Map<String, List<String>>> ordnames = new HashMap<>();
        for (Map<String, Object> r : repo.orderNameRows()) {
            ordnames.computeIfAbsent((String) r.get("case_id"), k -> new LinkedHashMap<>())
                    .computeIfAbsent((String) r.get("order_category"), k -> new ArrayList<>())
                    .add((String) r.get("order_name"));
        }
        // names sorted HERE, not in SQL: order_name is raw hospital text (much
        // of it Thai) and PG collation disagrees with Java's, so the payload
        // would otherwise vary with the database's locale
        for (Map<String, List<String>> byCat : ordnames.values()) {
            byCat.values().forEach(names -> names.sort(Comparator.naturalOrder()));
        }

        // views.py:144 — case_id -> [display names], first-touch order, demo.reset excluded
        Map<String, String> coderNames = users.displayNameByStamp();
        Map<String, List<String>> caseCoders = new HashMap<>();
        for (Map<String, Object> r : repo.coderHistoryRows()) {
            String caseId = (String) r.get("case_id");
            String by = detailBy((String) r.get("action_detail"));
            if (!Py.truthy(by) || "demo.reset".equals(by)) {
                continue;
            }
            String display = coderDisplay(by, coderNames);
            List<String> lst = caseCoders.computeIfAbsent(caseId, k -> new ArrayList<>());
            if (!lst.contains(display)) {
                lst.add(display);
            }
        }

        // Average confidence from saved RAG/coder code edits (null when unset).
        Map<String, Integer> aiConfidence = workingState.avgConfidenceByCase();

        // views.py:194 — finalization info from the audit trail
        Map<String, String> approvedAt = new HashMap<>();
        Map<String, String> approvedBy = new HashMap<>();
        for (Map<String, Object> r : repo.approvalRows()) {
            String caseId = (String) r.get("case_id");
            Map<String, Object> d = detailJson((String) r.get("action_detail"));
            approvedAt.put(caseId,
                    Py.slice(Py.or_(str(d.get("at")), (String) r.get("created_at"), ""), 10));
            if (Py.truthy(str(d.get("by")))) {
                approvedBy.put(caseId, str(d.get("by")));
            }
        }

        // views.py:207 — last approve/reopen action per case: (action, by, at[:10])
        Map<String, String[]> lastFlow = new HashMap<>();
        for (Map<String, Object> r : repo.flowRows()) {
            Map<String, Object> d = detailJson((String) r.get("action_detail"));
            lastFlow.put((String) r.get("case_id"), new String[]{
                    (String) r.get("action_type"),
                    str(d.get("by")),
                    Py.slice(Py.or_(str(d.get("at")), (String) r.get("created_at"), ""), 10)});
        }

        // views.py:216 — route each OPD case into finished / reopened / complete
        // / incomplete groups. `reopened` became a first-class exclusive queue on
        // 2026-07-24 (MIGRATION_ISSUES.md issue 2): the old frontend derived the
        // Reopen tab client-side from the per-case flag; the server owns it now.
        List<Map<String, Object>> complete = new ArrayList<>();
        List<Map<String, Object>> reopened = new ArrayList<>();
        List<Map<String, Object>> finished = new ArrayList<>();
        Map<String, List<Map<String, Object>>> groups = new HashMap<>();
        Set<String> finishedOmits = Set.of("confidence", "ccpi", "cc", "pi");

        for (Map<String, Object> r : repo.opdCases()) {
            Map<String, Object> u = uiCase(r, coverage, ccpi, codes, ordcat, ordnames, caseCoders, aiConfidence);
            String id = (String) u.get("id");
            if ("approved".equals(r.get("case_status"))) {
                // views.py:221 — finished is an exclusive queue
                String by = Py.or_(approvedBy.get(id), "");
                Map<String, Object> fin = new LinkedHashMap<>();
                for (var e : u.entrySet()) {
                    if (!finishedOmits.contains(e.getKey())) {
                        fin.put(e.getKey(), e.getValue());
                    }
                }
                fin.put("codedDate",
                        Py.or_(approvedAt.get(id), Py.slice(Py.or_((String) r.get("fetched_at"), ""), 10)));
                fin.put("coder", coderDisplay(by, coderNames));
                fin.put("coderId", Py.or_(by, "—")); // raw audit stamp
                fin.put("drg", "—");
                fin.put("reopenable", true); // DEPRECATED: any coder may reopen any case
                finished.add(fin);
            } else {
                // views.py:237 — reopened queue; demo.reset reopens excluded.
                // The flag fields stay on the row (the queue itself is the truth,
                // the fields carry the who/when).
                String[] lf = lastFlow.getOrDefault(id, new String[]{null, null, null});
                boolean isReopened = "reopened".equals(lf[0]) && !"demo.reset".equals(lf[1]);
                if (isReopened) {
                    u.put("reopened", true);
                    if (Py.truthy(lf[2])) {
                        u.put("reopenedAt", lf[2]);
                    }
                    if (Py.truthy(lf[1])) {
                        u.put("reopenedBy", coderDisplay(lf[1], coderNames));
                    }
                }
                if ("complete".equals(r.get("completeness_status"))) {
                    (isReopened ? reopened : complete).add(u);
                } else {
                    // views.py:252 — missing labels + order-category bucketing
                    List<String> labels = new ArrayList<>();
                    for (String m : Py.or_((String) r.get("missing_detail"), "").split(",", -1)) {
                        if (!m.isEmpty()) {
                            labels.add(MISSING_LABEL.getOrDefault(m, m));
                        }
                    }
                    String missing = String.join(", ", labels);
                    Map<?, ?> oc = (Map<?, ?>) u.get("orders");
                    String g;
                    if (oc.containsKey("surgery")) {
                        g = "Surgery";
                    } else if (oc.containsKey("CT") || oc.containsKey("X-ray")) {
                        g = "CT / X-ray";
                    } else if (oc.containsKey("medicine")) {
                        g = "Medicine";
                    } else {
                        g = "Other";
                    }
                    Map<String, Object> row = new LinkedHashMap<>(u);
                    row.put("missing", Py.or_(missing, "—"));
                    if (isReopened) {
                        // reopened is exclusive: the row keeps `missing` (its
                        // incomplete origin) but leaves the incomplete groups
                        reopened.add(row);
                    } else {
                        groups.computeIfAbsent(g, k -> new ArrayList<>()).add(row);
                    }
                }
            }
        }

        // views.py:269 — explicit group ids (a generic slugger would mangle "CT / X-ray")
        Map<String, String> orderGroupId = Map.of(
                "Surgery", "surgery", "CT / X-ray", "ct-x-ray", "Medicine", "medicine", "Other", "other");
        List<Map<String, Object>> incompleteGroups = groups.entrySet().stream()
                .sorted(Comparator
                        .comparingInt((Map.Entry<String, List<Map<String, Object>>> e) -> -e.getValue().size())
                        .thenComparing(Map.Entry::getKey))
                .<Map<String, Object>>map(e -> {
                    Map<String, Object> gm = new LinkedHashMap<>();
                    gm.put("id", orderGroupId.get(e.getKey()));
                    gm.put("label", e.getKey() + " Group");
                    gm.put("total", e.getValue().size());
                    gm.put("cases", e.getValue());
                    return gm;
                })
                .toList();

        int incompleteCount = incompleteGroups.stream()
                .mapToInt(g -> ((List<?>) g.get("cases")).size()).sum();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", complete.size() + incompleteCount + reopened.size() + finished.size());
        stats.put("complete", complete.size());
        stats.put("incomplete", incompleteCount);
        stats.put("reopened", reopened.size());
        stats.put("finished", finished.size());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stats", stats);
        out.put("complete", complete);
        out.put("incompleteGroups", incompleteGroups);
        out.put("reopened", reopened);
        out.put("finished", finished);
        return out;
    }

    // views.py:159 ui_case() — key order is the contract, keep it verbatim
    private Map<String, Object> uiCase(Map<String, Object> r,
                                       Map<String, Map<String, Object>> coverage,
                                       Map<String, Map<String, String>> ccpi,
                                       Map<String, List<Map<String, Object>>> codes,
                                       Map<String, Map<String, Object>> ordcat,
                                       Map<String, Map<String, List<String>>> ordnames,
                                       Map<String, List<String>> caseCoders,
                                       Map<String, Integer> aiConfidence) {
        String cid = (String) r.get("case_id");
        Map<String, String> cc = ccpi.getOrDefault(cid, Map.of());
        Map<String, Object> cv = coverage.get(r.get("coverage_type"));

        Map<String, Object> u = new LinkedHashMap<>();
        u.put("id", cid); // the real VN (iMed transactionnumber)
        u.put("patient", null); // no real patient-name source exists (Data Mapping Q1)
        u.put("hn", r.get("patient_ref")); // real column; null where the extract lacks it
        u.put("dept", Py.or_((String) r.get("department"), (String) r.get("ward"), "—"));
        u.put("ward", r.get("ward"));
        u.put("group", Py.or_((String) r.get("disease_group"), "Ungrouped"));
        u.put("confidence", aiConfidence.get(cid)); // avg of saved RAG/coder code confidences
        u.put("severity", r.get("severity_level"));
        u.put("coverage", r.get("coverage_type"));
        u.put("coverageLabel", cv == null ? null
                : Py.or_((String) cv.get("label_th"), (String) cv.get("label_en"), (String) cv.get("scheme_family")));
        u.put("coverageFamily", cv == null ? null : cv.get("scheme_family"));
        u.put("coders", caseCoders.getOrDefault(cid, List.of()));
        u.put("encountertype", r.get("encountertype"));
        u.put("ccpi", Py.or_(cc.get("Chief Complaint"), cc.get("Subjective"), cc.get("Present Illness"), null));
        u.put("cc", Py.or_(cc.get("Chief Complaint"), cc.get("Subjective"), ""));
        u.put("pi", Py.or_(cc.get("Present Illness"), ""));
        List<Map<String, Object>> cs = codes.getOrDefault(cid, List.of());
        u.put("codes", cs.size() > 6 ? cs.subList(0, 6) : cs);
        u.put("orders", ordcat.getOrDefault(cid, Map.of()));
        u.put("orderNames", ordnames.getOrDefault(cid, Map.of()));
        u.put("created_at", r.get("admissiondatetime")); // real column; null where the extract lacks it
        u.put("updated_at", r.get("dischargedatetime")); // real column; null where the extract lacks it
        u.put("revenue_impact", null); // no real DRG/revenue source exists
        return u;
    }

    // views.py:286 build_case_detail() — null when the case does not exist
    public Map<String, Object> buildCaseDetail(String caseId) {
        Map<String, Object> caseRow = repo.caseRow(caseId);
        if (caseRow == null) {
            return null;
        }
        Map<String, Object> cov = repo.coverageRow((String) caseRow.get("coverage_type"));

        // views.py:295 — recorddatetime is RAW hospital text: stable re-sort in
        // code, not SQL (SQLite byte order vs Postgres collation disagree);
        // TimSort keeps section_id insertion order on ties, like Python's sort
        List<Map<String, Object>> sections = new ArrayList<>(repo.sectionRows(caseId));
        sections.sort(Comparator
                .comparing((Map<String, Object> s) -> s.get("recorddatetime") != null)
                .thenComparing(s -> Py.or_((String) s.get("recorddatetime"), "")));

        // per-case audit trail (meeting item 17): what every coder did to this
        // case, for the detail's `history` array. action = raw action_type,
        // coder = the acting account ("" when unrecorded), at = created_at
        // sliced to "YYYY-MM-DD HH:MM:SS", detail = the parsed action_detail
        // (omitted when empty). demo.reset churn is excluded, like the
        // dashboard's coders list.
        List<Map<String, Object>> history = new ArrayList<>();
        Map<String, String> coderNames = users.displayNameByStamp();
        for (Map<String, Object> r : repo.caseHistoryRows(caseId)) {
            Map<String, Object> d = detailJson((String) r.get("action_detail"));
            String by = str(d.get("by"));
            if ("demo.reset".equals(by)) {
                continue;
            }
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("action", r.get("action_type"));
            e.put("coder", coderDisplay(Py.or_(by, ""), coderNames));
            e.put("at", Py.slice(Py.or_((String) r.get("created_at"), ""), 19));
            if (!d.isEmpty()) {
                e.put("detail", d);
            }
            history.add(e);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("case", caseRow);
        out.put("coverage", cov);
        out.put("sections", sections);
        out.put("codes", repo.detailCodeRows(caseId));
        out.put("orders", repo.detailOrderRows(caseId));
        out.put("history", history);
        return out;
    }

    // views.py:149 — json.loads(action_detail or '{}') with ValueError -> {}
    private Map<String, Object> detailJson(String actionDetail) {
        if (!Py.truthy(actionDetail)) {
            return Map.of();
        }
        try {
            return json.readValue(actionDetail, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (RuntimeException e) {
            return Map.of();
        }
    }

    private String detailBy(String actionDetail) {
        return str(detailJson(actionDetail).get("by"));
    }

    /** Resolve an audit stamp (email / demo.coder / old name) to users.full_name. */
    private static String coderDisplay(String stamp, Map<String, String> names) {
        if (stamp == null || stamp.isBlank()) {
            return stamp == null ? "" : stamp;
        }
        String mapped = names.get(stamp);
        return mapped != null ? mapped : stamp;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
