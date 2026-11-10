-- V6 — the two foreign keys that hand-written DDL lost (2026-08-20)
--
-- Every child table keyed by case_id references cases(case_id):
--   case_codes, case_code_edits, case_orders, case_report_sections,
--   coding_history, document_chunks
-- Two do not: case_vitals and imed_write_ops. Both were created by
-- config/SchemaBootstrap.java rather than by SQL, and the convention was simply
-- forgotten there — nothing chose to leave them out, and nothing could notice,
-- because the Java was the only thing that ran and the db/migrations/*.sql
-- "mirror" of it was never applied by anything.
--
-- Consequence today: deleting a case leaves its vitals and its hospital
-- write-back journal behind, pointing at a case_id that no longer resolves.
--
-- Plain REFERENCES, no ON DELETE CASCADE — that is the shape all six existing
-- keys use, and matching them is the entire point of this migration.
--
-- The DELETEs below drop rows that are already unreachable: a vitals row is
-- hospital-sourced and re-imported by the next sync, and a journal row for a
-- case that does not exist can never be replayed by a reopen. Both are no-ops
-- on a healthy database (verified zero orphans on the dev database and on a
-- freshly seeded one) and exist so the ALTERs cannot fail on a database that
-- accumulated orphans while the keys were missing.

DELETE FROM case_vitals v
WHERE NOT EXISTS (SELECT 1 FROM cases c WHERE c.case_id = v.case_id);

DELETE FROM imed_write_ops w
WHERE NOT EXISTS (SELECT 1 FROM cases c WHERE c.case_id = w.case_id);

-- No ADD CONSTRAINT IF NOT EXISTS in PostgreSQL; Flyway runs this file exactly
-- once per database, but the guard keeps it re-runnable by hand.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_vitals_case_id_fkey') THEN
        ALTER TABLE case_vitals ADD CONSTRAINT case_vitals_case_id_fkey
            FOREIGN KEY (case_id) REFERENCES cases(case_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'imed_write_ops_case_id_fkey') THEN
        ALTER TABLE imed_write_ops ADD CONSTRAINT imed_write_ops_case_id_fkey
            FOREIGN KEY (case_id) REFERENCES cases(case_id);
    END IF;
END $$;
