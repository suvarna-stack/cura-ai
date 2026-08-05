package com.medcodeai.api.service;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure derivation/normalization helpers for the iMed → MedCode AI sync, ported
 * from the retired Python POC sync/sync.py. Everything here is a naive [POC]
 * placeholder rule (in a real system these are AI / configurable) — kept
 * faithful to the source so the ported pipeline reproduces the same values.
 * No DB, no I/O: unit-testable in isolation (see SyncRulesTest).
 */
public final class SyncRules {

    private SyncRules() {
    }

    // sync.py:23 ICD10_GROUP — first letter of ICD-10 → disease-pattern group (F04)
    private static final Map<Character, String> ICD10_GROUP = Map.ofEntries(
            Map.entry('A', "Infectious"), Map.entry('B', "Infectious"),
            Map.entry('C', "Oncology"), Map.entry('D', "Oncology/Blood"),
            Map.entry('E', "Endocrinology"), Map.entry('F', "Psychiatry"),
            Map.entry('G', "Neurological"), Map.entry('H', "Eye/ENT"),
            Map.entry('I', "Cardiovascular"), Map.entry('J', "Respiratory"),
            Map.entry('K', "Gastro"), Map.entry('L', "Skin"),
            Map.entry('M', "Orthopedic"), Map.entry('N', "Genitourinary"),
            Map.entry('O', "Obstetrics"), Map.entry('P', "Perinatal"),
            Map.entry('Q', "Congenital"), Map.entry('R', "Symptoms/Signs"),
            Map.entry('S', "Injury"), Map.entry('T', "Injury"),
            Map.entry('V', "External"), Map.entry('W', "External"),
            Map.entry('X', "External"), Map.entry('Y', "External"),
            Map.entry('Z', "Factors"));

    // sync.py:86 DIAG_ROLE — hospital diagnosistype → our code_role (Q3 mapping)
    public static final Map<String, String> DIAG_ROLE = Map.of(
            "PRIMARY_DIAGNOSIS", "principal_diagnosis",
            "COMORBIDITY", "secondary_diagnosis",
            "OTHERS", "other",
            "EXTERNAL_CAUSE_OF_INJURY", "external_cause");

    // sync.py:97 coverage family: opaque hospital codes, only the scheme family
    // is derivable from the code itself (labels stay null until the hospital
    // provides its official list).
    private static final Map<String, String> COVERAGE_FAMILY_SPECIAL = Map.of(
            "Cashonly", "SELF_PAY", "foreign", "FOREIGN");
    private static final Map<String, String> FAMILY_PAYER = Map.of(
            "OFC", "CGD", "VOF", "CGD",
            "UCS", "NHSO", "WEL", "NHSO", "LGO", "NHSO", "VLG", "NHSO", "DIS", "NHSO",
            "SELF_PAY", "SELF");

    // sync.py:36 DT_RE — tolerates the Q5 missing-separator case "2026-04-0106:45:00"
    private static final Pattern DT_RE =
            Pattern.compile("(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{2}:\\d{2}(:\\d{2})?)?");

    /** sync.py:38 parse_dt() — normalize a hospital datetime to "YYYY-MM-DD HH:MM:SS", or null. */
    public static String parseDt(String raw) {
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        Matcher m = DT_RE.matcher(raw.strip());
        if (!m.lookingAt()) { // Python re.match anchors at start only
            return null;
        }
        String d = m.group(1);
        String t = m.group(2) != null ? m.group(2) : "00:00:00";
        if (t.length() == 5) { // HH:MM → HH:MM:00
            t += ":00";
        }
        return d + " " + t;
    }

    /** sync.py:47 chunk() — split section text into fixed-size pieces (F11); [] when empty. */
    public static List<String> chunk(String text, int size) {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        if (text == null || text.isEmpty()) {
            return out;
        }
        for (int i = 0; i < text.length(); i += size) {
            out.add(text.substring(i, Math.min(i + size, text.length())));
        }
        return out;
    }

    public static List<String> chunk(String text) {
        return chunk(text, 500);
    }

    /** sync.py:104 coverage_family() — OFC_O3 → OFC, UCS_89_I → UCS, Cashonly → SELF_PAY. */
    public static String coverageFamily(String code) {
        if (COVERAGE_FAMILY_SPECIAL.containsKey(code)) {
            return COVERAGE_FAMILY_SPECIAL.get(code);
        }
        int us = code.indexOf('_');
        return us >= 0 ? code.substring(0, us) : "OTHER";
    }

    /** Payer for a coverage family, or null when unknown. */
    public static String familyPayer(String family) {
        return FAMILY_PAYER.get(family);
    }

    /** sync.py:159 — IPD admission (admissionnumber present) → "1", else OPD → "0". */
    public static String encounterType(String admissionNumber) {
        return admissionNumber != null && !admissionNumber.strip().isEmpty() ? "1" : "0";
    }

    /**
     * Completeness (F03) [POC]. Returns the missing[] labels; empty means
     * complete. Rule changed 2026-08-05: a case is complete when the hospital
     * data ALREADY CARRIED both code systems at sync time — at least one ICD-10
     * diagnosis and at least one ICD-9 procedure. The old documentation-section
     * rule (chief/exam/assessment, admission note/clinical summary) is gone;
     * completeness now means "arrived already coded", and everything else is
     * the coding work this product queues up. Same rule for OPD and IPD.
     */
    public static List<String> missingCodes(boolean hasIcd10, boolean hasIcd9) {
        java.util.ArrayList<String> missing = new java.util.ArrayList<>();
        if (!hasIcd10) {
            missing.add("icd10");
        }
        if (!hasIcd9) {
            missing.add("icd9");
        }
        return missing;
    }

    /** sync.py:174 disease group (F04) [POC] — ICD-10 chapter of the primary dx. */
    public static String diseaseGroup(String primaryIcd) {
        if (primaryIcd == null || primaryIcd.isEmpty()) {
            return "Ungrouped";
        }
        return ICD10_GROUP.getOrDefault(primaryIcd.charAt(0), "Ungrouped");
    }

    /** sync.py:177 severity (F06) [POC] — comorbidity count buckets. */
    public static String severity(int comorbidityCount) {
        if (comorbidityCount >= 3) {
            return "high";
        }
        return comorbidityCount >= 1 ? "medium" : "low";
    }
}
