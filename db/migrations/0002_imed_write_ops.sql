-- Manual mirror of the imed_write_ops DDL in config/SchemaBootstrap.java
-- (the runner applies it idempotently at every startup).
--
-- Context: the diff-based hospital write-back (2026-07-24). On approve,
-- medcode-api diffs the coder's final codes against the hospital's live rows
-- and issues POST (create) / PUT (edit) / DELETE (cancel) against the real
-- iMed diagnosis API. Every touched hospital row is journaled here with its
-- before-image; reopen builds its revert plan from these rows (the API has
-- no "undo"). first-op-wins per object_id; cleared per case after a
-- successful revert.

CREATE TABLE IF NOT EXISTS imed_write_ops (
    op_id       serial PRIMARY KEY,
    case_id     varchar(50) NOT NULL,
    op          text NOT NULL,        -- 'created' | 'updated' | 'cancelled'
    code_kind   text NOT NULL,        -- 'icd10' | 'icd9'
    object_id   varchar(100) NOT NULL,
    before_json text,                 -- pre-op row image; null for 'created'
    created_at  text
);
CREATE INDEX IF NOT EXISTS imed_write_ops_case_idx ON imed_write_ops (case_id);
