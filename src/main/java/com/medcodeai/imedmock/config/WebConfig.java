package com.medcodeai.imedmock.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Registers the Bearer gate on the real-shaped /api/v1 write surface only. */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final ApiV1AuthInterceptor auth;

    public WebConfig(ApiV1AuthInterceptor auth) {
        this.auth = auth;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(auth).addPathPatterns("/api/v1/**");
    }
}
