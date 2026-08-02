package com.medcodeai.api.service;

import com.medcodeai.api.repo.WorkingStateRepository;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

@Service
public class WorkingStateService {

    /** codeEdits (parsed JSON or null). Report drafts are gone — the report
     *  is the hospital's record, read-only since 2026-08-02. */
    public record WorkingState(Object edits) {}

    private final WorkingStateRepository repo;
    private final JsonMapper json = new JsonMapper();

    public WorkingStateService(WorkingStateRepository repo) {
        this.repo = repo;
    }

    // app.py:196 load_working_state() — edits parse like Flask's json.loads:
    // unparseable payload degrades to null, never an error
    public WorkingState load(String caseId) {
        String payload = repo.loadEditsPayload(caseId);
        Object edits = null;
        if (payload != null) {
            try {
                edits = json.readValue(payload, Object.class);
            } catch (RuntimeException e) {
                edits = null;
            }
        }
        return new WorkingState(edits);
    }
}
