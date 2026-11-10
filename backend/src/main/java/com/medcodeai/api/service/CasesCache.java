package com.medcodeai.api.service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * Port of app.py's module-level _cases_cache: the whole cases.json payload is
 * expensive to build (whole-DB scan), so it is cached in-process and reset by
 * invalidate() after every approve/reopen/reset — NOT after codes/draft saves
 * (working state never shows in cases.json). Like Flask under gunicorn
 * --workers 1, this assumes a single server instance.
 */
@Component
public class CasesCache {

    private final AtomicReference<Map<String, Object>> cache = new AtomicReference<>();

    public Map<String, Object> get(Supplier<Map<String, Object>> builder) {
        Map<String, Object> v = cache.get();
        if (v == null) {
            v = builder.get();
            cache.set(v);
        }
        return v;
    }

    // app.py:121 invalidate_cases_cache()
    public void invalidate() {
        cache.set(null);
    }
}
