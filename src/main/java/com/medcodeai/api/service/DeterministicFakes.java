package com.medcodeai.api.service;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Port of the [POC] deterministic fake-data helpers in sync/views.py:12-96.
 * All randomness is sha1-based (never a process-salted hash) so the same case
 * id renders the same values across exports, servers and languages. Python's
 * int(hexdigest, 16) equals new BigInteger(1, sha1bytes); every % and >> is
 * done on the full 160-bit value. Guarded value-for-value against the Python
 * by DeterministicFakesTest (golden file from scripts/gen_fakes_golden.py).
 */
public final class DeterministicFakes {

    private DeterministicFakes() {}

    // views.py:12 — [POC] placeholder AI confidence base per severity
    private static final Map<String, Integer> SEV_CONF =
            Map.of("low", 91, "medium", 76, "high", 58);

    // views.py:13 conf()
    public static int conf(String caseId, String severity) {
        int jitter = sha1Int(caseId).mod(BigInteger.valueOf(9)).intValue() - 4;
        String sev = truthy(severity) ? severity : "low";
        int base = SEV_CONF.getOrDefault(sev, 80);
        return Math.max(30, Math.min(99, base + jitter));
    }

    // views.py:20 _h() — deterministic per-case randomness, salted per field
    static BigInteger h(String caseId, String salt) {
        return sha1Int(salt + ":" + caseId);
    }

    private static BigInteger sha1Int(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8));
            return new BigInteger(1, d);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static long mod(BigInteger x, int m) {
        return x.mod(BigInteger.valueOf(m)).longValue();
    }

    // views.py:28-40 — [POC] de-identified display names (Data Mapping Q1)
    private static final List<String> MALE_NAMES = List.of(
            "Somchai", "Somsak", "Prasert", "Sompong", "Suchart", "Chatchai",
            "Theerayut", "Kritsada", "Preecha", "Anan", "Wichai", "Manop",
            "Narong", "Kamol", "Thanawat", "Piyawat", "Surachai", "Ekachai",
            "Kittisak", "Pongsak", "Adisorn", "Chaiwat", "Nattapong", "Worawut");
    private static final List<String> FEMALE_NAMES = List.of(
            "Pornpan", "Saowalak", "Kanchana", "Siriporn", "Wanida", "Sunisa",
            "Ratree", "Pimchanok", "Natthida", "Chutima", "Orathai", "Benjawan",
            "Duangjai", "Kessara", "Malee", "Nareerat", "Patcharee", "Rungnapa",
            "Supaporn", "Thidarat", "Waraporn", "Yupin", "Achara", "Jiraporn");
    private static final List<String> SURNAMES = List.of(
            "Wongsawat", "Maneerat", "Ruangrit", "Boonsri", "Pongpan", "Srisuwan",
            "Chaiyasit", "Thongchai", "Kittikhun", "Saengthong", "Phromchana",
            "Rattanakorn", "Suwannarat", "Intharachai", "Charoensuk", "Bunmee",
            "Kaewkla", "Nilrat", "Phongam", "Sukjai", "Tancharoen", "Udomsak",
            "Vorapan", "Yodrak", "Anuwat", "Jaturapat");

    // views.py:41 fake_name() — sex-matched to cases.sex
    public static String fakeName(String caseId, String sex) {
        List<String> first = "female".equals(sex) ? FEMALE_NAMES : MALE_NAMES;
        return first.get((int) mod(h(caseId, "fn"), first.size()))
                + " " + SURNAMES.get((int) mod(h(caseId, "ln"), SURNAMES.size()));
    }

    // views.py:46 fake_hn() — [POC] fake 7-digit "68xxxxx" HN (Data Mapping Q1)
    public static String fakeHn(String caseId) {
        return String.valueOf(6800000 + mod(h(caseId, "hn"), 100000));
    }

    // views.py:56 — FIXED anchor; a moving anchor would churn every row
    private static final LocalDateTime ANCHOR = LocalDateTime.of(2026, 7, 15, 12, 0, 0);
    private static final DateTimeFormatter FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'+07:00'");

    // views.py:57 fake_dates() — returns {created, updated}
    public static String[] fakeDates(String caseId) {
        BigInteger x = h(caseId, "dt");
        LocalDateTime created = ANCHOR
                .minusDays(mod(x, 545))
                .minusHours(mod(x.shiftRight(16), 24))
                .minusMinutes(mod(x.shiftRight(24), 60));
        LocalDateTime updated = created
                .plusDays(mod(x.shiftRight(8), 4))
                .plusHours(mod(x.shiftRight(32), 12));
        if (updated.isAfter(ANCHOR)) {
            updated = ANCHOR;
        }
        return new String[]{created.format(FMT), updated.format(FMT)};
    }

    // views.py:65 revenue_impact() — [POC] severity-weighted mock band
    public static String revenueImpact(String caseId, String severity) {
        int x = (int) mod(h(caseId, "rev"), 100);
        if ("high".equals(severity)) {
            return x < 94 ? "high" : "medium";
        }
        if ("medium".equals(severity)) {
            return x < 60 ? "high" : (x < 97 ? "medium" : "low");
        }
        return x < 51 ? "medium" : (x < 94 ? "low" : "high");
    }

    // views.py:78 — coder display names for the Finished tab
    private static final List<String> CODER_NAMES =
            List.of("Lalita M.", "Sarah K.", "Teerapat S.", "Panitda W.", "Naret P.");

    // views.py:81 display_coder() — workflow id -> display name
    public static String displayCoder(String caseId, String by) {
        if ("demo.coder".equals(by)) {
            return CODER_NAMES.get((int) mod(h(caseId, "coder"), CODER_NAMES.size()));
        }
        return truthy(by) ? "Sarah K." : "—";
    }

    // views.py:89 MISSING_LABEL
    public static final Map<String, String> MISSING_LABEL = missingLabels();

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

    // Python truthiness for the str fields we branch on (None and "" are falsy)
    static boolean truthy(String s) {
        return s != null && !s.isEmpty();
    }
}
