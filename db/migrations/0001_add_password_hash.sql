-- 0001 — auth support on the frozen seed schema.
--
-- The medcode schema ships as a plain pg_dump (db/seed.sql.gz) with no
-- migration tool. This file documents the one schema change auth needs and can
-- be applied by hand (psql) against an existing database. At runtime the app
-- applies the same change idempotently at startup (config/SchemaBootstrap.java),
-- which ALSO seeds a bootstrap admin from ADMIN_BOOTSTRAP_EMAIL /
-- ADMIN_BOOTSTRAP_PASSWORD — so on a normal boot you do NOT need to run this.
--
-- No enum change: roles stay {coder, admin}, status stays {active, inactive,
-- suspended}. Passwords are per-account BCrypt hashes.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
