package com.medcodeai.imedmock.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Builds the single DataSource for the mock hospital database (`imed`).
 *
 * Same env contract as medcode-api so both containers configure identically:
 * DATABASE_URL in libpq form (postgresql://user:pass@host:port/db) is
 * translated to jdbc:postgresql://…; JDBC_DATABASE_URL (already JDBC) wins
 * when set. With neither set we fall back to the local dev database
 * (localhost:5432, db "imed" — seeded by scripts/seed_local_imed_pg.sh).
 *
 * The two driver parameters are kept for uniformity with medcode-api; every
 * medhack_* column is TEXT (the extracts' non-uniform datetime formats are
 * stored verbatim), so values round-trip as plain strings either way.
 */
@Configuration
public class DataSourceConfig {

    private static final String REQUIRED_PARAMS = "stringtype=unspecified&binaryTransfer=false";

    @Bean
    public DataSource dataSource() {
        HikariConfig cfg = new HikariConfig();
        String jdbcUrl = env("JDBC_DATABASE_URL");
        if (jdbcUrl != null) {
            cfg.setJdbcUrl(appendRequiredParams(jdbcUrl));
        } else {
            String dsn = env("DATABASE_URL");
            if (dsn == null) {
                dsn = "postgresql://localhost:5432/imed";
                if (env("PGUSER") == null) {
                    cfg.setUsername(System.getProperty("user.name"));
                }
            }
            applyLibpqDsn(cfg, dsn);
        }
        // Tiny pool: one caller (medcode-api, itself single-instance) + demos.
        cfg.setMaximumPoolSize(3);
        cfg.setMaxLifetime(600_000);
        return new HikariDataSource(cfg);
    }

    private void applyLibpqDsn(HikariConfig cfg, String dsn) {
        URI uri = URI.create(dsn);
        String scheme = uri.getScheme();
        if (!"postgresql".equals(scheme) && !"postgres".equals(scheme)) {
            throw new IllegalArgumentException("DATABASE_URL must be a postgresql:// DSN");
        }
        String userInfo = uri.getRawUserInfo();
        if (userInfo != null) {
            String[] parts = userInfo.split(":", 2);
            cfg.setUsername(URLDecoder.decode(parts[0], StandardCharsets.UTF_8));
            if (parts.length > 1) {
                cfg.setPassword(URLDecoder.decode(parts[1], StandardCharsets.UTF_8));
            }
        }
        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        String db = uri.getPath() == null || uri.getPath().isEmpty() ? "postgres" : uri.getPath().substring(1);
        String url = "jdbc:postgresql://" + uri.getHost() + ":" + port + "/" + db;
        if (uri.getRawQuery() != null && !uri.getRawQuery().isEmpty()) {
            url += "?" + uri.getRawQuery();
        }
        cfg.setJdbcUrl(appendRequiredParams(url));
    }

    private String appendRequiredParams(String url) {
        return url + (url.contains("?") ? "&" : "?") + REQUIRED_PARAMS;
    }

    private static String env(String name) {
        String v = System.getenv(name);
        return v == null || v.isEmpty() ? null : v;
    }
}
