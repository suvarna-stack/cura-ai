package com.medcodeai.api.web;

import com.medcodeai.api.service.AuthService;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A taught rule belongs to the coder who taught it: everyone reads the list,
 * only the author (or an admin) may edit, mute or delete a rule.
 *
 * The decision itself is pure — a stored note plus the caller's principal —
 * so it is tested here without a database, a token or a running RAG. What the
 * controller adds around it is only the lookup that produces the note.
 */
class AgentLearnOwnershipTest {

    private static AuthService.Principal coder(int id, String name, String email) {
        return new AuthService.Principal(id, email, name, "coder", "s");
    }

    private static Map<String, Object> note(Object ownerId, String ownerName) {
        Map<String, Object> note = new HashMap<>();
        note.put("id", "ln_20260822_abc123");
        if (ownerId != null) {
            note.put("created_by_id", ownerId);
        }
        note.put("created_by", ownerName);
        return note;
    }

    @Test
    void theAuthorMayChangeTheirOwnRule() {
        assertTrue(AgentLearnController.mayManage(
                note(7, "Somchai P."), coder(7, "Somchai P.", "somchai@h.test")));
    }

    @Test
    void anotherCoderMayNot() {
        assertFalse(AgentLearnController.mayManage(
                note(7, "Somchai P."), coder(8, "Nok S.", "nok@h.test")));
    }

    @Test
    void twoCodersSharingADisplayNameStayApart() {
        // Exactly what the stable id buys: same name, different account.
        assertFalse(AgentLearnController.mayManage(
                note(7, "Somchai P."), coder(8, "Somchai P.", "somchai2@h.test")));
    }

    @Test
    void renamingTheAuthorDoesNotCostThemTheirRule() {
        assertTrue(AgentLearnController.mayManage(
                note(7, "Somchai P."), coder(7, "Somchai Prasert", "somchai@h.test")));
    }

    @Test
    void anAdminMayChangeAnyRule() {
        var admin = new AuthService.Principal(9, "admin@h.test", "Admin", "admin", "s");
        assertTrue(AgentLearnController.mayManage(note(7, "Somchai P."), admin));
    }

    @Test
    void aRuleTaughtBeforeOwnerIdsFallsBackToTheCreditedName() {
        assertTrue(AgentLearnController.mayManage(
                note(null, "Somchai P."), coder(7, "Somchai P.", "somchai@h.test")));
        assertTrue(AgentLearnController.mayManage(          // credited by email
                note(null, "somchai@h.test"), coder(7, "Somchai P.", "somchai@h.test")));
        assertFalse(AgentLearnController.mayManage(
                note(null, "Somchai P."), coder(8, "Nok S.", "nok@h.test")));
    }

    @Test
    void aRuleCreditedToNobodyBelongsToNobody() {
        assertTrue(AgentLearnController.mayManage(
                note(null, ""), coder(8, "Nok S.", "nok@h.test")));
    }

    @Test
    void aJsonOwnerIdArrivesAsWhateverNumberJacksonPicked() {
        // The id crosses two JSON hops; only its value may decide anything.
        assertTrue(AgentLearnController.mayManage(
                note(7L, "Somchai P."), coder(7, "Somchai P.", "somchai@h.test")));
        assertFalse(AgentLearnController.mayManage(
                note(70L, "Somchai P."), coder(7, "Somchai P.", "somchai@h.test")));
    }
}
