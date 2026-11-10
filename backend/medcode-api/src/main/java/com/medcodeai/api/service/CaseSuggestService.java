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

    /**
     * What the patient came in with, and how it developed. A coder reads these
     * two first and so does the suggester: the disease is in the complaint and
     * the history of it, not in the boilerplate that follows. They lead the
     * query and are the last thing any cap is allowed to cut.
     */
    private static final List<String> PRIMARY = List.of(
            "chief complaint", "chiefcomplaint", "cc",
            "present illness", "history of present", "hpi"
    );

    /** Read after the complaint: these confirm, stage or rule out what it says. */
    private static final List<String> SUPPORTING = List.of(
            "subjective", "objective", "assessment", "plan",
            "diagnosis", "principal diagnosis", "final diagnosis",
            "procedure", "operative", "operation",
            "physical examination", "progress"
    );

    /**
     * The RAG service embeds only the first 3500 characters of the narrative,
     * so anything past that was being built here and thrown away there. Cap at
     * the same number: what we send is now exactly what gets searched on.
     */
    private static final int TOTAL_MAX = 3500;

    /** ...of which the complaint and the illness history may claim this much
     *  before any supporting section is allowed in. */
    private static final int PRIMARY_MAX = 2000;

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
                String src = str(m.get("source"));
                row.put("source", src);
                boolean taught = src != null && src.startsWith("coder note");
                if (row.get("code") != null && row.get("system") != null
                        && (taught || systemFitsCode(str(m.get("system")), str(m.get("code"))))) {
                    codes.add(row);
                }
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("caseId", caseId);
        out.put("codes", codes);
        // Suggest & Learn: rules a coder taught that match THIS narrative. They
        // ride along with the suggestions so the case page can point them out
        // above the machine's own guesses.
        out.put("notes", notes(ragOut.get("notes")));
        out.put("mode", ragOut.getOrDefault("mode", "plain"));
        out.put("hitsUsed", ragOut.getOrDefault("hits_used", 0));
        out.put("clinicalChars", clinical.length());
        return out;
    }

    /**
     * The page files a suggestion into a column by its {@code system} string,
     * so a mislabelled row lands in the wrong column with no way for the coder
     * to tell. ICD-10 codes start with a letter, ICD-9-CM procedure codes do
     * not; anything that disagrees never leaves this service. Codes a coder
     * taught by hand (source "coder note ...") are exempt — they may be local
     * shapes, e.g. Thai TTM, and the coder's own label is the truth there.
     */
    private static boolean systemFitsCode(String system, String code) {
        if (system == null || code == null || code.isBlank()) {
            return false;
        }
        boolean letterFirst = Character.isLetter(code.charAt(0));
        boolean saysNine = system.toLowerCase(Locale.ROOT).contains("9");
        return saysNine != letterFirst;
    }

    /**
     * The narrative the suggestion is made from, in three tiers: the complaint
     * and its history first (up to PRIMARY_MAX), then the sections that back
     * them up, then whatever else the hospital sent — each tier only if there
     * is room left under TOTAL_MAX. Ordering IS the weighting here: the text
     * is embedded as one vector, so what leads it decides what is retrieved.
     */
    private String clinicalText(String caseId) {
        List<String> primary = new ArrayList<>();
        List<String> supporting = new ArrayList<>();
        List<String> other = new ArrayList<>();
        for (Map<String, Object> s : cases.sectionRows(caseId)) {
            String name = str(s.get("fieldname"));
            String value = str(s.get("value"));
            if (value == null || value.isBlank() || "—".equals(value)) {
                continue;
            }
            String label = name == null ? "section" : name;
            String block = label + ":\n" + value.trim();
            if (name != null && matches(name, PRIMARY)) {
                primary.add(block);
            } else if (name != null && matches(name, SUPPORTING)) {
                supporting.add(block);
            } else {
                other.add(block);
            }
        }
        StringBuilder sb = new StringBuilder();
        appendWithin(sb, primary, PRIMARY_MAX);
        appendWithin(sb, supporting, TOTAL_MAX);
        appendWithin(sb, other, TOTAL_MAX);
        return sb.toString();
    }

    /**
     * Appends whole sections while they fit under {@code budget}. A section
     * that would overflow is SKIPPED rather than cut, so the query never ends
     * mid-symptom — except when nothing has been written yet, where a single
     * over-long complaint is truncated rather than lost entirely.
     */
    private static void appendWithin(StringBuilder sb, List<String> blocks, int budget) {
        for (String block : blocks) {
            if (sb.length() == 0) {
                sb.append(block.length() > budget ? block.substring(0, budget) : block);
                continue;
            }
            if (sb.length() + 2 + block.length() > budget) {
                continue;
            }
            sb.append("\n\n").append(block);
        }
    }

    private static boolean matches(String fieldname, List<String> names) {
        String n = fieldname.toLowerCase(Locale.ROOT);
        for (String p : names) {
            if (n.contains(p)) {
                return true;
            }
        }
        return false;
    }

    /** Whitelist the fields the case page renders; drop anything unshaped. */
    private static List<Map<String, Object>> notes(Object raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(raw instanceof List<?> list)) {
            return out;
        }
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m) || !(m.get("id") instanceof String id)) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id);
            row.put("summary", str(m.get("summary")));
            row.put("scenario", str(m.get("scenario")));
            row.put("rule", str(m.get("rule")));
            row.put("codes", m.get("codes") instanceof List<?> c ? c : List.of());
            row.put("createdBy", str(m.get("created_by")));
            row.put("via", str(m.get("via")));
            out.add(row);
        }
        return out;
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
