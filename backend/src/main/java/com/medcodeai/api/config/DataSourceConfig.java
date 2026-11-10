package com.medcodeai.api.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Builds the single DataSource from the same env vars the Flask POC reads.
 *
 * DATABASE_URL arrives in libpq form (postgresql://user:pass@host:port/db)
 * — the Supabase session-pooler DSN — and is translated to jdbc:postgresql://…
 * JDBC_DATABASE_URL (already in JDBC form) wins when set. With neither set we
 * fall back to the local dev database (Homebrew Postgres 18, db "medcode").
 *
 * Two driver parameters are load-bearing for Flask parity:
 *  - stringtype=unspecified — setString() may write into ENUM and JSONB
 *    columns, exactly like psycopg2 sends untyped text.
 *  - binaryTransfer=false — getString() on timestamp/date columns returns the
 *    server's wire text (pgdb.py registers raw-text loaders for the same
 *    reason; the JSON contract slices datetimes as strings).
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
                dsn = "postgresql://localhost:5432/medcode";
                if (env("PGUSER") == null) {
                    cfg.setUsername(System.getProperty("user.name"));
                }
            }
            applyLibpqDsn(cfg, dsn);
        }
        // Tiny pool: single-instance deployment, Supabase free-tier pooler.
        cfg.setMaximumPoolSize(3);
        // Below the pooler's idle cutoff so we never hold a dead connection.
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
