package com.medcodeai.api.service;

import java.util.regex.Pattern;

/**
 * Tiny helpers replicating the exact Python semantics views.py relies on.
 * Getting these wrong produces subtle parity diffs, so they live in one place.
 */
public final class Py {

    private Py() {}

    /**
     * Python's {@code a or b or c}: first truthy value, else the LAST operand
     * (which Python returns as-is, even when falsy — e.g. "" or None).
     * String truthiness: null and "" are falsy.
     */
    public static String or_(String... vals) {
        for (int i = 0; i < vals.length - 1; i++) {
            if (truthy(vals[i])) {
                return vals[i];
            }
        }
        return vals[vals.length - 1];
    }

    public static boolean truthy(String s) {
        return s != null && !s.isEmpty();
    }

    // Python str.split() splits on Unicode whitespace (incl. NBSP); Java's
    // plain \s is ASCII-only, hence UNICODE_CHARACTER_CLASS.
    private static final Pattern WS = Pattern.compile("\\s+", Pattern.UNICODE_CHARACTER_CLASS);

    /** Python's {@code ' '.join(s.split())} — collapse all whitespace runs. */
    public static String collapseWs(String s) {
        String r = WS.matcher(s).replaceAll(" ");
        int a = 0;
        int b = r.length();
        while (a < b && r.charAt(a) == ' ') {
            a++;
        }
        while (b > a && r.charAt(b - 1) == ' ') {
            b--;
        }
        return r.substring(a, b);
    }

    /** Python's {@code s[:n]} — slice by code points, not UTF-16 units. */
    public static String slice(String s, int n) {
        int i = 0;
        int cp = 0;
        while (i < s.length() && cp < n) {
            i = s.offsetByCodePoints(i, 1);
            cp++;
        }
        return s.substring(0, i);
    }
}
