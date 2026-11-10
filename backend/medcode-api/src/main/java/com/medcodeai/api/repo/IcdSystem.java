package com.medcodeai.api.repo;

/**
 * The two ICD catalogs. Until 2026-07-28 these were one `icd_codes` table
 * discriminated by the `code_system_t` enum column; they are now two physical
 * tables (`icd_10` / `icd_9`) with independent id spaces, because the systems
 * are expected to diverge — ICD-9-CM procedure codes and ICD-10 diagnosis
 * codes want different columns.
 *
 * Consequence for callers: a catalog id is meaningless without knowing which
 * system it belongs to, so the two always travel together (see
 * CodingRepository.insertCaseCode).
 *
 * {@link #of} is deliberately strict — an unrecognised label used to be
 * rejected by the enum column's type cast, and staying loud preserves that.
 */
public enum IcdSystem {

    ICD_10("ICD-10"),
    ICD_9("ICD-9");

    private final String label;

    IcdSystem(String label) {
        this.label = label;
    }

    /** The wire/DB spelling, e.g. "ICD-10" — what the API contract exposes as `system`. */
    public String label() {
        return label;
    }

    public static IcdSystem of(String label) {
        for (IcdSystem s : values()) {
            if (s.label.equals(label)) {
                return s;
            }
        }
        throw new IllegalArgumentException("Unknown ICD code system: " + label);
    }
}
