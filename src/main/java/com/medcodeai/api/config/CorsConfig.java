package com.medcodeai.api.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Port of app.py's flask-cors setup (app.py:68-71): ALLOWED_ORIGINS env var,
 * "*" (the default) allows every origin, otherwise a comma-separated list
 * (each entry trimmed). Applies to all /api routes; no credentials.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String allowed = System.getenv().getOrDefault("ALLOWED_ORIGINS", "*");
        String[] origins = "*".equals(allowed.strip())
                ? new String[]{"*"}
                : java.util.Arrays.stream(allowed.split(",")).map(String::strip).toArray(String[]::new);
        registry.addMapping("/api/**")
                .allowedOrigins(origins)
                // DELETE added for admin account removal; allowedHeaders("*")
                // already permits the Authorization header (Bearer token auth,
                // no cookies → no allowCredentials needed).
                .allowedMethods("GET", "PUT", "POST", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }
}
