package com.medcodeai.api.web;

import com.medcodeai.api.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Requires the admin role. Registered in WebConfig on /api/admin/** only, right
 * after {@link AuthInterceptor} (which has already authenticated the token and
 * stored the principal).
 *
 * The role gate lives here, and not as a string check on the request URI inside
 * AuthInterceptor, because Spring picks the controller from the DECODED path:
 * "/api/%61dmin/accounts" reaches the admin controller, while the raw URI does
 * not start with "/api/admin/". Interceptor path patterns use the same matcher
 * as controller routing, so whatever reaches an admin route passes through here.
 */
@Component
public class AdminRoleInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        if (!(request.getAttribute(AuthInterceptor.PRINCIPAL) instanceof AuthService.Principal principal)) {
            throw new ApiExceptionHandler.UnauthorizedException("unauthorized");
        }
        if (!"admin".equals(principal.role())) {
            throw new ApiExceptionHandler.ForbiddenException("forbidden");
        }
        return true;
    }
}
