-- V8 — case stars (2026-08-25)
--
-- A coder marks a case as important so the NEXT coder sees it. The star is a
-- property of the case, not of the person who clicked it: one row per starred
-- case, everyone sees the same stars, and unstarring deletes the row. That is
-- deliberately not a per-user favourites list — the whole point is that a
-- fellow coder can tell which case matters, which a private list cannot do.
--
-- starred_by is the raw audit stamp (the account's email), exactly like
-- coding_history's action_detail.by — display names are resolved on read from
-- users.full_name, so renaming an account renames its stars too.
-- starred_at is "YYYY-MM-DD HH:MM:SS" text, the convention V7 uses and the one
-- the API contract documents for backend-written datetimes.
--
-- REFERENCES cases(case_id) with no ON DELETE CASCADE, matching every other
-- case-keyed table (see V6 — that convention is the point).

CREATE TABLE IF NOT EXISTS case_stars (
    case_id    varchar(50) PRIMARY KEY REFERENCES cases(case_id),
    starred_by text NOT NULL,
    starred_at text NOT NULL
);

-- A database that already holds a demo baseline was snapshotted before this
-- table existed, and DemoBaselineService.reset() refills EVERY baselined table
-- by name — so without this, the first reset after upgrading would fail on a
-- missing demo_baseline.case_stars. An empty baseline table is exactly right:
-- demo start has no stars. (No-op where no baseline has been taken yet; the
-- next POST /api/demo/snapshot recreates it from the live table anyway.)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'demo_baseline') THEN
        CREATE TABLE IF NOT EXISTS demo_baseline.case_stars
            (LIKE public.case_stars INCLUDING DEFAULTS);
    END IF;
END $$;
