package com.medcodeai.api.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Agent chat history tables (agent_conversations + agent_messages, see
 * SchemaBootstrap.agentChatTables). Every query is scoped by user_id so one
 * coder can never read or touch another's conversations — the controller
 * passes the authenticated principal's id, not anything client-supplied.
 *
 * sources / unverified_codes are stored as JSON-array text and returned
 * verbatim; the controller (de)serializes them.
 */
@Repository
public class AgentChatRepository {

    private final JdbcTemplate jdbc;

    public AgentChatRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Newest-updated first — the sidebar's list order. */
    public List<Map<String, Object>> listConversations(int userId) {
        return jdbc.query("""
                SELECT conversation_id, mode, title, created_at, updated_at
                FROM agent_conversations WHERE user_id=?
                ORDER BY updated_at DESC, conversation_id DESC""",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getInt("conversation_id"));
                    m.put("mode", rs.getString("mode"));
                    m.put("title", rs.getString("title"));
                    m.put("created_at", rs.getString("created_at"));
                    m.put("updated_at", rs.getString("updated_at"));
                    return m;
                }, userId);
    }

    /** The conversation header if it exists AND belongs to this user, else null. */
    public Map<String, Object> findConversation(int conversationId, int userId) {
        List<Map<String, Object>> rows = jdbc.query("""
                SELECT conversation_id, mode, title, created_at, updated_at
                FROM agent_conversations WHERE conversation_id=? AND user_id=?""",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getInt("conversation_id"));
                    m.put("mode", rs.getString("mode"));
                    m.put("title", rs.getString("title"));
                    m.put("created_at", rs.getString("created_at"));
                    m.put("updated_at", rs.getString("updated_at"));
                    return m;
                }, conversationId, userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public List<Map<String, Object>> listMessages(int conversationId) {
        return jdbc.query("""
                SELECT role, content, sources, unverified_codes, created_at
                FROM agent_messages WHERE conversation_id=?
                ORDER BY message_id""",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("role", rs.getString("role"));
                    m.put("content", rs.getString("content"));
                    m.put("sources", rs.getString("sources"));
                    m.put("unverified_codes", rs.getString("unverified_codes"));
                    m.put("created_at", rs.getString("created_at"));
                    return m;
                }, conversationId);
    }

    public int insertConversation(int userId, String mode, String title, String now) {
        Integer id = jdbc.queryForObject("""
                INSERT INTO agent_conversations (user_id, mode, title, created_at, updated_at)
                VALUES (?,?,?,?,?) RETURNING conversation_id""",
                Integer.class, userId, mode, title, now, now);
        return id == null ? -1 : id;
    }

    public void insertMessage(int conversationId, String role, String content,
                              String sourcesJson, String unverifiedJson, String now) {
        jdbc.update("""
                INSERT INTO agent_messages
                    (conversation_id, role, content, sources, unverified_codes, created_at)
                VALUES (?,?,?,?,?,?)""",
                conversationId, role, content, sourcesJson, unverifiedJson, now);
    }

    public void touchConversation(int conversationId, String now) {
        jdbc.update("UPDATE agent_conversations SET updated_at=? WHERE conversation_id=?",
                now, conversationId);
    }

    public void renameConversation(int conversationId, String title, String now) {
        jdbc.update("UPDATE agent_conversations SET title=?, updated_at=? WHERE conversation_id=?",
                title, now, conversationId);
    }

    /** Messages go with it (ON DELETE CASCADE). */
    public void deleteConversation(int conversationId) {
        jdbc.update("DELETE FROM agent_conversations WHERE conversation_id=?", conversationId);
    }
}
