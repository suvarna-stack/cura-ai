package com.medcodeai.imedmock.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;

/**
 * Bearer-token gate on the /api/v1/** write surface, mimicking the real iMed
 * API ("Authorization: Bearer &lt;access-token&gt;"). The mock accepts ONE
 * static token from IMED_API_TOKEN (default "imed-mock-token" so local dev
 * just works); the real API's token issuance is the hospital's business —
 * medcode-api only needs the header plumbing to be exercised.
 *
 * The 401 body is the real API's exact shape ({"message", "message_th"} — no
 * "status" key, unlike the 400/409 business errors). The extract READ
 * endpoints stay open: production read auth is still TBD with the hospital.
 */
@Component
public class ApiV1AuthInterceptor implements HandlerInterceptor {

    private final String token;

    public ApiV1AuthInterceptor() {
        String t = System.getenv("IMED_API_TOKEN");
        this.token = (t == null || t.isEmpty()) ? "imed-mock-token" : t;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler)
            throws Exception {
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) {
            return true; // CORS preflight carries no Authorization header
        }
        String auth = req.getHeader("Authorization");
        if (auth != null && auth.equals("Bearer " + token)) {
            return true;
        }
        res.setStatus(401);
        res.setContentType("application/json");
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.getWriter().write("{\"message\":\"unauthorized\",\"message_th\":\"ไม่มีสิทธิเข้าถึง\"}");
        return false;
    }
}
