package com.medcodeai.api.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Seeds the bootstrap admin account, once, on a database that has none.
 *
 * This class used to be SchemaBootstrap and also carried every DDL statement
 * added after the frozen seed dump — the same statements that were ALSO kept as
 * db/migrations/000N.sql "mirrors" for humans to read. Nothing ran those files
 * and nothing compared the two copies, so they drifted: case_vitals and
 * imed_write_ops were created here WITHOUT the foreign key to cases that every
 * other child table in the schema carries. Flyway now runs the SQL files
 * (classpath:db/migrations, V1-V5) and they are the only definition of the
 * schema; see V6 for the missing keys.
 *
 * What is left here is deliberately NOT schema: creating an account needs the
 * PasswordEncoder to hash ADMIN_BOOTSTRAP_PASSWORD, which a .sql file cannot do.
 * It stays an ApplicationRunner, so it runs after the context is up — and
 * therefore after Flyway, which migrates during DataSource initialization.
 *
 * Idempotent: it does nothing at all once any admin exists, so a re-seeded
 * database self-heals on the next boot and @SpringBootTest gets its login.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private static final String DEFAULT_ADMIN_EMAIL = "admin@medcodeai.demo";
    private static final String DEFAULT_ADMIN_PASSWORD = "admin1234";

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;

    public AdminBootstrap(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.encoder = encoder;
    }

    @Override
    public void run(ApplicationArguments args) {
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
