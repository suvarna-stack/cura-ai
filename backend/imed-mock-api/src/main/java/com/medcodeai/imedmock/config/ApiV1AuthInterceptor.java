package com.medcodeai.imedmock.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;

/**
 * Bearer-token gate on every /api/v1/** route, mimicking the hospital's
 * Medihack API ("Authorization: Bearer {ACCESS_TOKEN}"). Only tokens issued
 * by {@code POST /auth/token} and not yet expired get through — see
 * {@link TokenStore}. The old single static token (IMED_API_TOKEN) is gone:
 * the real API has no such thing, and a mock that accepted one would let a
 * client that never fetches or refreshes its token pass every test.
 *
 * The 401 body is the guide's exact shape ({"message", "message_th"} — no
 * "status" key, unlike the 400/422 business errors).
 */
@Component
public class ApiV1AuthInterceptor implements HandlerInterceptor {

    /** The guide's 401 body, shared with the token endpoint's refusal. */
    public static final String UNAUTHORIZED_BODY =
            "{\"message\":\"unauthorized\",\"message_th\":\"ไม่มีสิทธิเข้าถึง\"}";

    private final TokenStore tokens;

    public ApiV1AuthInterceptor(TokenStore tokens) {
        this.tokens = tokens;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler)
            throws Exception {
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) {
            return true; // CORS preflight carries no Authorization header
        }
        String auth = req.getHeader("Authorization");
        if (auth != null && auth.startsWith("Bearer ") && tokens.isValid(auth.substring(7).trim())) {
            return true;
        }
        res.setStatus(401);
        res.setContentType("application/json");
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.getWriter().write(UNAUTHORIZED_BODY);
        return false;
    }
}
