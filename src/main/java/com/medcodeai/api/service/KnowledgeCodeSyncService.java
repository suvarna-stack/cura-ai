package com.medcodeai.api.service;

import com.medcodeai.api.client.RagApiClient;
import com.medcodeai.api.repo.IcdCatalogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Pulls the code + official-title pairs the RAG service extracted from the
 * uploaded reference documents and upserts them into icd_codes.
 *
 * Non-destructive by design: new codes are inserted, blank descriptions are
 * filled, but descriptions that already exist (typically free text from real
 * hospital case data) are NEVER overwritten — the coder workflow's
 * find-or-create keeps working unchanged either way.
 */
@Service
public class KnowledgeCodeSyncService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeCodeSyncService.class);

    private final RagApiClient rag;
    private final IcdCatalogRepository catalog;

    public KnowledgeCodeSyncService(RagApiClient rag, IcdCatalogRepository catalog) {
        this.rag = rag;
        this.catalog = catalog;
    }

    public Map<String, Object> syncCodes() {
        Map<String, Object> extracted = rag.extractedCodes();
        Object codesObj = extracted.get("codes");
        List<?> codes = codesObj instanceof List<?> l ? l : List.of();
        Map<String, String> existing = catalog.existingDescriptions();

        List<Object[]> toInsert = new ArrayList<>();
        List<Object[]> toFill = new ArrayList<>();
        int unchanged = 0;
        for (Object o : codes) {
            if (!(o instanceof Map<?, ?> c)) {
                continue;
            }
            String code = str(c.get("code"));
            String system = str(c.get("system"));
            String description = str(c.get("description"));
            if (code == null || system == null || description == null) {
                continue;
            }
            String current = existing.get(code + "|" + system);
            if (current == null) {
                toInsert.add(new Object[]{code, system, description});
            } else if (current.isBlank()) {
                toFill.add(new Object[]{description, code, system});
            } else {
                unchanged++;
            }
        }

        if (!toInsert.isEmpty()) {
            catalog.insertCodes(toInsert);
        }
        if (!toFill.isEmpty()) {
            catalog.fillDescriptions(toFill);
        }
        log.info("Knowledge code sync: {} extracted, {} added, {} descriptions filled, {} unchanged",
                codes.size(), toInsert.size(), toFill.size(), unchanged);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("documentsScanned", extracted.getOrDefault("documents_scanned", 0));
        out.put("extracted", codes.size());
        out.put("added", toInsert.size());
        out.put("descriptionsFilled", toFill.size());
        out.put("unchanged", unchanged);
        return out;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
