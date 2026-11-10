-- V7 — agent chat history (2026-08-20)
--
-- The coder AI Agent page keeps its conversations server-side — per user,
-- surviving refresh and re-login. The RAG call itself stays stateless (history
-- is still re-sent per request); these tables are only the browsing and
-- persistence layer.
--
-- Arrived on main as db/migrations/0006_agent_chat_history.sql plus a
-- SchemaBootstrap.agentChatTables() copy of the same statements — the last
-- instance of the Java/SQL mirror this branch removes. The Java half is gone;
-- this file is now the only definition. IF NOT EXISTS keeps it a no-op on
-- databases where that startup code already created the tables.

CREATE TABLE IF NOT EXISTS agent_conversations (
    conversation_id serial PRIMARY KEY,
    user_id         int NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    mode            text NOT NULL,          -- 'dict' | 'learn' (chat page tab)
    title           text NOT NULL,          -- first question, truncated
    created_at      text,                   -- "yyyy-MM-dd HH:mm:ss", like the rest
    updated_at      text
);
CREATE INDEX IF NOT EXISTS agent_conversations_user_idx
    ON agent_conversations (user_id);

CREATE TABLE IF NOT EXISTS agent_messages (
    message_id       serial PRIMARY KEY,
    conversation_id  int NOT NULL
        REFERENCES agent_conversations(conversation_id) ON DELETE CASCADE,
    role             text NOT NULL,         -- 'user' | 'assistant'
    content          text NOT NULL,
    sources          text,                  -- JSON array of citation labels (assistant only)
    unverified_codes text,                  -- JSON array of ICD codes (assistant only)
    created_at       text
);
CREATE INDEX IF NOT EXISTS agent_messages_convo_idx
    ON agent_messages (conversation_id);
