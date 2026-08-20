package com.medcodeai.api.web;

import com.medcodeai.api.repo.IcdCatalogRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Catalog search for the coder UI's code pickers (Edit / Add code modals).
 * Reads the {@code icd_10} and {@code icd_9} tables — hospital imports plus
 * knowledge sync. (One {@code icd_codes} table until the 2026-07-28 split.)
 */
@RestController
@Tag(name = "icd catalog", description = "Search ICD-9 / ICD-10 catalog for code pickers")
@SecurityRequirement(name = "bearerAuth")
public class IcdCatalogController {

    private final IcdCatalogRepository catalog;

    public IcdCatalogController(IcdCatalogRepository catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/api/icd-codes")
    @Operation(summary = "Search ICD codes",
            description = "`q` matches code or description. Optional `system` = `ICD-10`|`ICD-9`. "
                    + "`limit` defaults to 20 (max 40).")
    public List<Map<String, Object>> search(
            @RequestParam("q") String q,
            @RequestParam(value = "system", required = false) String system,
            @RequestParam(value = "limit", defaultValue = "20") int limit) {
        if (q == null || q.isBlank()) {
            throw new ApiExceptionHandler.BadRequestException("q is required");
        }
        String sys = system == null || system.isBlank() ? null : system.strip();
        if (sys != null && !sys.equalsIgnoreCase("ICD-10") && !sys.equalsIgnoreCase("ICD-9")) {
            throw new ApiExceptionHandler.BadRequestException("system must be ICD-10 or ICD-9");
        }
        if (sys != null) {
            sys = sys.equalsIgnoreCase("ICD-9") ? "ICD-9" : "ICD-10";
        }
        return catalog.search(q, sys, limit);
    }

    // POST, not GET: the ICD filter dialog looks up every code on the loaded
    // cases at once — hundreds of codes, far past any sane URL length
    @PostMapping("/api/icd-codes/lookup")
    @Operation(summary = "Bulk code → description lookup",
            description = "`{\"codes\": [\"A09\", \"93.27\", ...]}` (≤1000) → `{code: description}` "
                    + "across both catalogs; codes with no known description are omitted.")
    public Map<String, String> lookup(@RequestBody(required = false) Map<String, Object> body) {
        Object raw = body == null ? null : body.get("codes");
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            throw new ApiExceptionHandler.BadRequestException("codes is required");
        }
        if (list.size() > 1000) {
            throw new ApiExceptionHandler.BadRequestException("too many codes (max 1000)");
        }
        List<String> codes = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof String s && !s.isBlank() && !codes.contains(s.strip())) {
                codes.add(s.strip());
            }
        }
        return catalog.descriptionsFor(codes);
    }
}
