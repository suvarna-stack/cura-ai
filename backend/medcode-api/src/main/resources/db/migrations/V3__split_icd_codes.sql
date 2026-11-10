-- V3 — split the single icd_codes catalog into icd_10 + icd_9.
--
-- db/seed.sql.gz still ships the old single-table shape, so a fresh re-seed
-- starts from a database where this has NOT been applied; Flyway re-runs it
-- there because the reset drops the schema history along with everything else.
-- The legacy-table guard below is what makes it a no-op everywhere else.
--
-- Context (2026-07-28): the single `icd_codes` catalog, discriminated by the
-- `code_system_t` enum, is split into two physical tables. The two systems are
-- expected to diverge — ICD-9-CM procedure codes and ICD-10 diagnosis codes
-- want different columns — and a shared table can only grow columns that are
-- null for half its rows.
--
-- case_codes consequently carries TWO nullable FK columns instead of one, with
-- a check constraint pinning exactly one of them per row. Original icd_code_id
-- values are preserved as the new primary keys: both systems drew from a single
-- sequence, so the id spaces are disjoint and the backfill is unambiguous (this
-- also makes the split reversible).
--
-- The `code_system_t` enum type is intentionally left defined but unused — the
-- discriminator is now which column is populated. Dropping the type would be
-- pure risk for no gain, and the seed dump still declares it.
--
-- No explicit BEGIN/COMMIT: Flyway already runs each migration inside one
-- transaction, and a COMMIT here would end THAT transaction mid-file, before
-- the schema-history row is written.

CREATE TABLE IF NOT EXISTS icd_10 (
    icd_10_id   serial PRIMARY KEY,
    code        varchar(20) NOT NULL UNIQUE,
    description text
);

CREATE TABLE IF NOT EXISTS icd_9 (
    icd_9_id    serial PRIMARY KEY,
    code        varchar(20) NOT NULL UNIQUE,
    description text
);

ALTER TABLE case_codes ADD COLUMN IF NOT EXISTS icd_10_id int REFERENCES icd_10(icd_10_id);
ALTER TABLE case_codes ADD COLUMN IF NOT EXISTS icd_9_id  int REFERENCES icd_9(icd_9_id);

-- Data move + backfill: only when the legacy table is still present.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'icd_codes') THEN

        INSERT INTO icd_10 (icd_10_id, code, description)
        SELECT icd_code_id, code, description FROM icd_codes WHERE code_system = 'ICD-10'
        ON CONFLICT DO NOTHING;

        INSERT INTO icd_9 (icd_9_id, code, description)
        SELECT icd_code_id, code, description FROM icd_codes WHERE code_system = 'ICD-9'
        ON CONFLICT DO NOTHING;

        -- ids were preserved, so the old pointer resolves into exactly one table
        UPDATE case_codes cc SET icd_10_id = cc.icd_code_id
        WHERE cc.icd_code_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM icd_10 t WHERE t.icd_10_id = cc.icd_code_id);

        UPDATE case_codes cc SET icd_9_id = cc.icd_code_id
        WHERE cc.icd_code_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM icd_9 t WHERE t.icd_9_id = cc.icd_code_id);

        ALTER TABLE case_codes DROP COLUMN icd_code_id;
        DROP TABLE icd_codes;
    END IF;
END $$;

-- Hand-assigned ids above bypass the sequences; realign them or the first
-- find-or-create insert collides with an existing key.
SELECT setval(pg_get_serial_sequence('icd_10', 'icd_10_id'),
              GREATEST((SELECT COALESCE(max(icd_10_id), 0) FROM icd_10), 1));
SELECT setval(pg_get_serial_sequence('icd_9', 'icd_9_id'),
              GREATEST((SELECT COALESCE(max(icd_9_id), 0) FROM icd_9), 1));

-- Exactly one catalog pointer per case_codes row (no ADD CONSTRAINT IF NOT EXISTS in PG).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_codes_one_catalog_ck') THEN
        ALTER TABLE case_codes ADD CONSTRAINT case_codes_one_catalog_ck
            CHECK (num_nonnulls(icd_10_id, icd_9_id) = 1);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS case_codes_icd_10_idx ON case_codes (icd_10_id);
CREATE INDEX IF NOT EXISTS case_codes_icd_9_idx  ON case_codes (icd_9_id);
