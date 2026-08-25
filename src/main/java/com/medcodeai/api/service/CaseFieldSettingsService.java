package com.medcodeai.api.service;

import com.medcodeai.api.repo.AppSettingsRepository;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Which identifier fields the case list is allowed to show.
 *
 * <p>Site policy, not a code constant: a hospital decides whether a patient
 * name, the VN and the HN may sit on a shared coding screen, and that decision
 * belongs to an administrator rather than to a release. Stored globally (V9),
 * never per account — two coders looking at the same list must see the same
 * fields, or "the HN is missing" becomes unanswerable over the phone.
 *
 * <p>The switches govern DISPLAY only. The payload still carries every value,
 * because the case detail, search and the audit trail all need them; hiding a
 * field is not the same as withholding the data from the application. If a
 * hospital ever needs the data itself withheld, that is a different feature
 * and belongs in the query, not here.
 */
@Service
public class CaseFieldSettingsService {

    /** The toggleable fields, in the order the admin screen lists them. */
    public static final List<String> FIELDS = List.of("vn", "hn", "name");

    /** Applied when a key is missing entirely — matches V9's seeded defaults. */
    private static final Map<String, Boolean> DEFAULTS =
            Map.of("vn", true, "hn", true, "name", false);

    private static final String PREFIX = "caseFields.";

    private final AppSettingsRepository repo;

    public CaseFieldSettingsService(AppSettingsRepository repo) {
        this.repo = repo;
    }

    /** {vn, hn, name} → boolean, always all three keys, in FIELDS order. */
    public Map<String, Object> get() {
        Map<String, String> raw = repo.all();
        Map<String, Object> out = new LinkedHashMap<>();
        for (String f : FIELDS) {
            String v = raw.get(PREFIX + f);
            out.put(f, v == null ? DEFAULTS.get(f) : "true".equalsIgnoreCase(v));
        }
        return out;
    }

    /**
     * Write the fields present in `updates`; absent keys are left alone, so a
     * client can PATCH one switch without having to echo the others back.
     *
     * @throws ApiBadField when a key is not a known field or its value is not
     *                     a boolean — a typo must not silently turn a field off
     */
    public Map<String, Object> update(Map<String, Object> updates, String by) {
        for (Map.Entry<String, Object> e : updates.entrySet()) {
            if (!FIELDS.contains(e.getKey())) {
                throw new ApiBadField("unknown field: " + e.getKey());
            }
            if (!(e.getValue() instanceof Boolean)) {
                throw new ApiBadField("field " + e.getKey() + " must be true or false");
            }
        }
        for (Map.Entry<String, Object> e : updates.entrySet()) {
            repo.put(PREFIX + e.getKey(), Boolean.TRUE.equals(e.getValue()) ? "true" : "false", by);
        }
        return get();
    }

    /** Thrown for a bad field name or non-boolean value; mapped to a 400. */
    public static class ApiBadField extends RuntimeException {
        public ApiBadField(String message) {
            super(message);
        }
    }
}
