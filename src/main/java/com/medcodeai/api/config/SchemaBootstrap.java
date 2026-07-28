package com.medcodeai.api.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Brings the frozen seed schema up to what auth needs, at startup, idempotently.
 * There is no migration tool in this project (the schema is a plain pg_dump —
 * db/seed.sql.gz) and the dump predates auth, so this runner is how the
 * password_hash column and a bootstrap admin come to exist. It is safe to run
 * on every boot (single instance): the ALTER is IF NOT EXISTS and the admin is
 * only created when none exists.
 *
 * Because @SpringBootTest boots the app, this also runs before the test suite,
 * so a freshly re-seeded database self-heals with no seed-script step.
 *
 * The same DDL is committed as db/migrations/0001_add_password_hash.sql for
 * manual/prod application.
 */
@Component
public class SchemaBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SchemaBootstrap.class);

    private static final String DEFAULT_ADMIN_EMAIL = "admin@medcodeai.demo";
    private static final String DEFAULT_ADMIN_PASSWORD = "admin1234";

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;

    public SchemaBootstrap(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.encoder = encoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbc.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text");

        // Revert journal for the diff-based hospital write-back (2026-07-24):
        // what approve changed at the hospital, with before-images, so reopen
        // can restore. Mirrored in db/migrations/0002_imed_write_ops.sql.
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS imed_write_ops (
                    op_id       serial PRIMARY KEY,
                    case_id     varchar(50) NOT NULL,
                    op          text NOT NULL,
                    code_kind   text NOT NULL,
                    object_id   varchar(100) NOT NULL,
                    before_json text,
                    created_at  text
                )""");
        jdbc.execute("CREATE INDEX IF NOT EXISTS imed_write_ops_case_idx ON imed_write_ops (case_id)");

        splitIcdCatalog();

        Long admins = jdbc.queryForObject(
                "SELECT COUNT(*) FROM users WHERE role = 'admin'", Long.class);
        if (admins != null && admins > 0) {
            return;
        }

        String email = env("ADMIN_BOOTSTRAP_EMAIL", DEFAULT_ADMIN_EMAIL);
        String password = env("ADMIN_BOOTSTRAP_PASSWORD", DEFAULT_ADMIN_PASSWORD);
        jdbc.update("""
                INSERT INTO users (email, full_name, role, status, password_hash)
                VALUES (?, ?, 'admin', 'active', ?)
                ON CONFLICT (email) DO NOTHING""",
                email, "Super Admin", encoder.encode(password));

        if (DEFAULT_ADMIN_PASSWORD.equals(password)) {
            log.warn("Created bootstrap admin '{}' with the DEFAULT password — set "
                    + "ADMIN_BOOTSTRAP_PASSWORD (and change it) before any real deployment.", email);
        } else {
            log.info("Created bootstrap admin '{}'.", email);
        }
    }

    /**
     * Splits the single `icd_codes` catalog into `icd_10` + `icd_9` (2026-07-28),
     * idempotently. The seed dump still ships the old one-table shape, so a fresh
     * re-seed lands here again on the next boot and re-applies the move.
     *
     * Original icd_code_id values become the new primary keys: both systems drew
     * from one sequence, so their id spaces are disjoint and each old pointer
     * resolves into exactly one of the two tables. Mirrored in
     * db/migrations/0003_split_icd_codes.sql.
     */
    private void splitIcdCatalog() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS icd_10 (
                    icd_10_id   serial PRIMARY KEY,
                    code        varchar(20) NOT NULL UNIQUE,
                    description text
                )""");
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS icd_9 (
                    icd_9_id    serial PRIMARY KEY,
                    code        varchar(20) NOT NULL UNIQUE,
                    description text
                )""");
        jdbc.execute("ALTER TABLE case_codes ADD COLUMN IF NOT EXISTS icd_10_id int REFERENCES icd_10(icd_10_id)");
        jdbc.execute("ALTER TABLE case_codes ADD COLUMN IF NOT EXISTS icd_9_id  int REFERENCES icd_9(icd_9_id)");

        Boolean legacy = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM information_schema.tables
                               WHERE table_schema = 'public' AND table_name = 'icd_codes')""",
                Boolean.class);
        if (Boolean.TRUE.equals(legacy)) {
            jdbc.execute("""
                    INSERT INTO icd_10 (icd_10_id, code, description)
                    SELECT icd_code_id, code, description FROM icd_codes WHERE code_system = 'ICD-10'
                    ON CONFLICT DO NOTHING""");
            jdbc.execute("""
                    INSERT INTO icd_9 (icd_9_id, code, description)
                    SELECT icd_code_id, code, description FROM icd_codes WHERE code_system = 'ICD-9'
                    ON CONFLICT DO NOTHING""");
            jdbc.execute("""
                    UPDATE case_codes cc SET icd_10_id = cc.icd_code_id
                    WHERE cc.icd_code_id IS NOT NULL
                      AND EXISTS (SELECT 1 FROM icd_10 t WHERE t.icd_10_id = cc.icd_code_id)""");
            jdbc.execute("""
                    UPDATE case_codes cc SET icd_9_id = cc.icd_code_id
                    WHERE cc.icd_code_id IS NOT NULL
                      AND EXISTS (SELECT 1 FROM icd_9 t WHERE t.icd_9_id = cc.icd_code_id)""");
            jdbc.execute("ALTER TABLE case_codes DROP COLUMN icd_code_id");
            jdbc.execute("DROP TABLE icd_codes");
            log.info("Split icd_codes into icd_10 + icd_9 (seed dump ships the pre-split shape).");
        }

        // hand-assigned ids above bypass the sequences; realign or the first
        // find-or-create insert collides with an existing key
        jdbc.execute("""
                SELECT setval(pg_get_serial_sequence('icd_10', 'icd_10_id'),
                              GREATEST((SELECT COALESCE(max(icd_10_id), 0) FROM icd_10), 1))""");
        jdbc.execute("""
                SELECT setval(pg_get_serial_sequence('icd_9', 'icd_9_id'),
                              GREATEST((SELECT COALESCE(max(icd_9_id), 0) FROM icd_9), 1))""");

        jdbc.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_codes_one_catalog_ck') THEN
                        ALTER TABLE case_codes ADD CONSTRAINT case_codes_one_catalog_ck
                            CHECK (num_nonnulls(icd_10_id, icd_9_id) = 1);
                    END IF;
                END $$""");
        jdbc.execute("CREATE INDEX IF NOT EXISTS case_codes_icd_10_idx ON case_codes (icd_10_id)");
        jdbc.execute("CREATE INDEX IF NOT EXISTS case_codes_icd_9_idx  ON case_codes (icd_9_id)");
    }

    private static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v.strip();
    }
}
