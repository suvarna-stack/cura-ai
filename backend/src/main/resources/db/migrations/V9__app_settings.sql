-- V9 — app settings (2026-08-25)
--
-- One global key/value bag for administrator-set display configuration. The
-- first (and so far only) consumer is the case-list field switches: the coder
-- asked to be able to turn the patient-name, VN and HN columns on and off from
-- the admin dashboard, because which identifiers a hospital is willing to show
-- on a shared screen is a site policy, not a code constant.
--
-- Global, NOT per user: the point is that every coder sees the same list. A
-- per-account preference would let two people disagree about whether HN is on
-- screen while looking at the same case.
--
-- value is text holding 'true'/'false' for these keys. Deliberately not jsonb
-- or a boolean column: the next setting is unlikely to be a boolean, and a
-- typed column per setting means a migration per setting.
--
-- updated_by is the raw audit stamp (the account's email), the same convention
-- coding_history.action_detail.by and case_stars.starred_by use. updated_at is
-- "YYYY-MM-DD HH:MM:SS" text, the convention V7/V8 use and the one the API
-- contract documents for backend-written datetimes.

CREATE TABLE IF NOT EXISTS app_settings (
    key        text PRIMARY KEY,
    value      text NOT NULL,
    updated_at text,
    updated_by text
);

-- Defaults, inserted only where the key is absent so an upgrade never
-- overwrites a choice an administrator already made.
--
-- VN and HN default ON: they are what a coder identifies a visit by, and both
-- already render (HN as "—" on OPD, where iMed does not supply it).
-- Patient name defaults OFF because there is no name anywhere in the hospital
-- extract yet (open Data-Mapping question Q1) — switching it on today would
-- add a permanently empty field. The switch exists so it can be turned on the
-- day iMed starts sending one, without a release.
INSERT INTO app_settings (key, value) VALUES
    ('caseFields.vn', 'true'),
    ('caseFields.hn', 'true'),
    ('caseFields.name', 'false')
ON CONFLICT (key) DO NOTHING;

-- NOT added to demo_baseline on purpose (contrast V8__case_stars). The demo
-- reset restores hospital DATA; an administrator's display policy is
-- configuration and must survive a reset, or every rehearsal would silently
-- put the switches back.
