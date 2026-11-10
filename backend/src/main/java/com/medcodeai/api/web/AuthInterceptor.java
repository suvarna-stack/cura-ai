package com.medcodeai.api.web;

import com.medcodeai.api.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * The whole auth gate. Registered (in WebConfig) on the guarded routes:
 * /api/admin/**, /api/auth/{me,logout}, and — since Phase 3 (2026-07-25) —
 * the whole case surface (/api/cases/**, /api/sync, /api/demo/reset). Only
 * /api/auth/login, the health probes, and Swagger stay public.
 *
 * It validates the Bearer token, and for /api/admin/** additionally requires
 * the admin role. On success the resolved Principal is stashed as a request
 * attribute — approve/reopen stamp their audit trail from it (the
 * body-supplied `coder` field is ignored now). Failures throw the
 * ApiExceptionHandler exceptions, so the 401/403 bodies stay the contract's
 * {"error": "..."}.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    /** Request attribute holding the authenticated {@link AuthService.Principal}. */
    public static final String PRINCIPAL = "authPrincipal";

    private final AuthService auth;

    public AuthInterceptor(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // Let CORS preflight through — it never carries the Authorization header.
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            throw new ApiExceptionHandler.UnauthorizedException("unauthorized");
        }
        AuthService.Principal principal = auth.authenticate(header.substring(7).strip());
        if (principal == null) {
            throw new ApiExceptionHandler.UnauthorizedException("unauthorized");
        }
        if (request.getRequestURI().startsWith("/api/admin/") && !"admin".equals(principal.role())) {
            throw new ApiExceptionHandler.ForbiddenException("forbidden");
        }
        request.setAttribute(PRINCIPAL, principal);
        return true;
    }
}
