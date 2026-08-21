-- V1 — auth support on the frozen seed schema.
--
-- The medcode schema ships as a plain pg_dump (db/seed.sql.gz) that predates
-- auth; the dump is Flyway's version 0 and this is the first change on top of
-- it. Applied by Flyway at startup. The bootstrap ADMIN ACCOUNT is not here —
-- hashing ADMIN_BOOTSTRAP_PASSWORD needs the PasswordEncoder, so it stays in
-- config/AdminBootstrap.java.
--
-- No enum change: roles stay {coder, admin}, status stays {active, inactive,
-- suspended}. Passwords are per-account BCrypt hashes.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
