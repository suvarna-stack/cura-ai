package com.medcodeai.api.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * The one security bean we need: a BCrypt password encoder, shared by
 * AdminBootstrap (hashing the bootstrap admin), AuthService (verifying logins)
 * and AccountService (hashing new/changed passwords).
 *
 * This comes from spring-security-crypto, NOT spring-boot-starter-security —
 * there is no filter chain and no auto-locked-down posture here. All request
 * gating is done by our own AuthInterceptor on the admin routes only.
 */
@Configuration
public class AuthConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
