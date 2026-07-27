package com.medcodeai.api.service;

import com.medcodeai.api.client.RagApiClient;
import com.medcodeai.api.repo.CasesRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Builds a clinical narrative from a case's report sections and asks the RAG
 * service for ICD-9 / ICD-10 suggestions grounded in the knowledge index.
 */
@Service
public class CaseSuggestService {

    /** Prefer these section names when assembling the RAG query. */
    private static final List<String> PREFERRED = List.of(
            "chief complaint", "chiefcomplaint", "cc",
            "subjective", "objective", "assessment", "plan",
            "present illness", "history of present", "hpi",
            "diagnosis", "principal diagnosis", "final diagnosis",
            "procedure", "operative", "operation",
            "physical examination", "progress"
    );

    private final CasesRepository cases;
    private final RagApiClient rag;

    public CaseSuggestService(CasesRepository cases, RagApiClient rag) {
        this.cases = cases;
        this.rag = rag;
    }

    public Map<String, Object> suggestForCase(String caseId) {
        if (cases.caseRow(caseId) == null) {
            return null;
        }
        String clinical = clinicalText(caseId);
        if (clinical.isBlank()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("caseId", caseId);
            empty.put("codes", List.of());
            empty.put("mode", "none");
            empty.put("hitsUsed", 0);
            empty.put("clinicalChars", 0);
            return empty;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("clinical_text", clinical);
        body.put("max_per_system", 8);

        Map<String, Object> ragOut;
        try {
            ragOut = rag.suggest(body);
        } catch (RestClientResponseException e) {
            throw e;
        }

        List<Map<String, Object>> codes = new ArrayList<>();
        Object raw = ragOut.get("codes");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) {
                    continue;
                }
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("code", str(m.get("code")));
                row.put("system", str(m.get("system")));
                row.put("description", str(m.get("description")));
                row.put("confidence", conf(m.get("confidence")));
                row.put("source", str(m.get("source")));
                if (row.get("code") != null && row.get("system") != null) {
                    codes.add(row);
                }
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("caseId", caseId);
        out.put("codes", codes);
        out.put("mode", ragOut.getOrDefault("mode", "plain"));
        out.put("hitsUsed", ragOut.getOrDefault("hits_used", 0));
        out.put("clinicalChars", clinical.length());
        return out;
    }

    private String clinicalText(String caseId) {
        List<Map<String, Object>> sections = cases.sectionRows(caseId);
        List<String> preferred = new ArrayList<>();
        List<String> rest = new ArrayList<>();
        for (Map<String, Object> s : sections) {
            String name = str(s.get("fieldname"));
            String value = str(s.get("value"));
            if (value == null || value.isBlank() || "—".equals(value)) {
                continue;
            }
            String label = name == null ? "section" : name;
            String block = label + ":\n" + value.trim();
            if (name != null && isPreferred(name)) {
                preferred.add(block);
            } else {
                rest.add(block);
            }
        }
        List<String> all = new ArrayList<>(preferred);
        all.addAll(rest);
        String joined = String.join("\n\n", all);
        // Cap so the RAG request stays focused.
        return joined.length() > 6000 ? joined.substring(0, 6000) : joined;
    }

    private static boolean isPreferred(String fieldname) {
        String n = fieldname.toLowerCase(Locale.ROOT);
        for (String p : PREFERRED) {
            if (n.contains(p)) {
                return true;
            }
        }
        return false;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static int conf(Object o) {
        if (o instanceof Number n) {
            return Math.max(0, Math.min(100, n.intValue()));
        }
        if (o == null) {
            return 70;
        }
        try {
            return Math.max(0, Math.min(100, Integer.parseInt(o.toString())));
        } catch (NumberFormatException e) {
            return 70;
        }
    }
}
