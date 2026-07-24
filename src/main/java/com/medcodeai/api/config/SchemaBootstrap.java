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

    private static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v.strip();
    }
}
