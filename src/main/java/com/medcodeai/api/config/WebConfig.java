package com.medcodeai.api.config;

import com.medcodeai.api.web.AuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Wires the auth gate onto the guarded routes only. CORS lives in its own
 * WebMvcConfigurer (CorsConfig); a second one purely for interceptors is fine.
 *
 * /api/auth/login is deliberately absent — logging in can't require a token.
 * Everything not listed here (all the case/approve/sync endpoints) stays public.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;

    public WebConfig(AuthInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/admin/**", "/api/auth/me", "/api/auth/logout");
    }
}
