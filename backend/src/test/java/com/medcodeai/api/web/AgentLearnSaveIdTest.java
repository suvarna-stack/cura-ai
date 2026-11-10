package com.medcodeai.api.web;

import com.medcodeai.api.client.RagApiClient;
import com.medcodeai.api.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * POST /api/agent/learn/notes with a `note.id` edits that rule in place, so the
 * author check must fail CLOSED: an id that is present but not a usable string
 * is refused, and the id forwarded to RAG is exactly the one that was checked.
 * Web layer only — the token lookup and RAG are mocked.
 */
@WebMvcTest(AgentLearnController.class)
class AgentLearnSaveIdTest {

    private static final String SAVE = "/api/agent/learn/notes";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private AuthService auth;

    @MockitoBean
    private RagApiClient rag;

    @BeforeEach
    void setUp() {
        when(auth.authenticate("coder-token"))
                .thenReturn(new AuthService.Principal(2, "coder@test", "Coder Two", "coder", "s-coder"));
        when(rag.note("mine")).thenReturn(Map.of("id", "mine", "created_by_id", 2));
        when(rag.note("theirs")).thenReturn(Map.of("id", "theirs", "created_by_id", 99,
                "created_by", "Someone Else"));
        when(rag.saveNote(any())).thenReturn(Map.of("ok", true));
    }

    private org.springframework.test.web.servlet.ResultActions save(String noteJson) throws Exception {
        return mvc.perform(post(SAVE).header("Authorization", "Bearer coder-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\": " + noteJson + "}"));
    }

    @Test
    void aNonStringIdIsRefused() throws Exception {
        save("{\"id\": 123, \"rule\": \"x\"}").andExpect(status().isBadRequest());
        save("{\"id\": [\"theirs\"], \"rule\": \"x\"}").andExpect(status().isBadRequest());
        save("{\"id\": {\"a\": 1}, \"rule\": \"x\"}").andExpect(status().isBadRequest());
        verify(rag, never()).saveNote(any());
    }

    @Test
    void someoneElsesRuleIsRefusedEvenWithPadding() throws Exception {
        save("{\"id\": \"  theirs  \", \"rule\": \"x\"}").andExpect(status().isForbidden());
        verify(rag, never()).saveNote(any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void theCheckedIdIsTheOneForwarded() throws Exception {
        save("{\"id\": \"  mine  \", \"rule\": \"x\"}").andExpect(status().isOk());
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(rag).saveNote(sent.capture());
        Map<String, Object> note = (Map<String, Object>) sent.getValue().get("note");
        assertEquals("mine", note.get("id"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void anUnknownIdIsNeverAnEdit() throws Exception {
        // RAG strips with Python's whitespace rules, which include U+00A0 —
        // Java's strip() does not. "theirs\u00A0" is unknown to the lookup but
        // would land on "theirs" in RAG, so an unknown id must not be forwarded.
        save("{\"id\": \"theirs\u00A0\", \"rule\": \"x\"}").andExpect(status().isOk());
        save("{\"id\": \"no-such-rule\", \"rule\": \"x\"}").andExpect(status().isOk());
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(rag, org.mockito.Mockito.times(2)).saveNote(sent.capture());
        for (Map<String, Object> payload : sent.getAllValues()) {
            Map<String, Object> note = (Map<String, Object>) payload.get("note");
            assertEquals(null, note.get("id"));
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void noIdOrABlankIdIsANewRule() throws Exception {
        save("{\"rule\": \"x\"}").andExpect(status().isOk());
        save("{\"id\": null, \"rule\": \"x\"}").andExpect(status().isOk());
        save("{\"id\": \"   \", \"rule\": \"x\"}").andExpect(status().isOk());
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(rag, org.mockito.Mockito.times(3)).saveNote(sent.capture());
        for (Map<String, Object> payload : sent.getAllValues()) {
            Map<String, Object> note = (Map<String, Object>) payload.get("note");
            assertEquals(null, note.get("id"));
        }
    }
}
