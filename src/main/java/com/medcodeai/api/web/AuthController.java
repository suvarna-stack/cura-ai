package com.medcodeai.api.web;

import com.medcodeai.api.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Login / logout / me. Bodies are parsed manually from raw bytes, same as
 * CasesWriteController, so malformed JSON produces our own {"error": ...} 400.
 *
 * /api/auth/login is public; /api/auth/me and /api/auth/logout are guarded by
 * AuthInterceptor, which stashes the resolved Principal on the request.
 */
@RestController
@Tag(name = "auth", description = "Login / logout / current user")
public class AuthController {

    private final AuthService auth;
    private final JsonMapper json = new JsonMapper();

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/api/auth/login")
    @Operation(summary = "Log in",
            description = "Verifies email + password against an **active** account and returns a "
                    + "Bearer `token` plus the user. Send the token as `Authorization: Bearer "
                    + "<token>` on guarded requests. `401` on any bad credential (the message "
                    + "never reveals which part failed).")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = """
                    {
                      "token": "0k8f…url-safe-opaque…",
                      "user": { "id": 2, "email": "admin@medcodeai.demo",
                                "fullName": "Super Admin", "role": "admin" }
                    }
                    """)))
    @ApiResponse(responseCode = "401", description = "Invalid email or password",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"invalid email or password\"}")))
    public Map<String, Object> login(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(type = "object"),
                            examples = @ExampleObject(
                                    value = "{\"email\": \"admin@medcodeai.demo\", \"password\": \"admin1234\"}")))
            @RequestBody(required = false) byte[] body) {
        Map<?, ?> b = parseObject(body);
        Object email = b.get("email");
        Object password = b.get("password");
        if (!(email instanceof String e) || e.isBlank()
                || !(password instanceof String p) || p.isEmpty()) {
            throw new ApiExceptionHandler.BadRequestException(
                    "expected {\"email\": \"...\", \"password\": \"...\"}");
        }
        return auth.login(((String) email).strip(), (String) password);
    }

    @PostMapping("/api/auth/logout")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Log out", description = "Revokes the current session token. Idempotent.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = "{\"ok\": true}")))
    @ApiResponse(responseCode = "401", description = "Missing or invalid token",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"unauthorized\"}")))
    public Map<String, Object> logout(HttpServletRequest request) {
        AuthService.Principal p = principal(request);
        auth.logout(p.sessionId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    @GetMapping("/api/auth/me")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Current user", description = "The account behind the Bearer token.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = """
                    { "id": 2, "email": "admin@medcodeai.demo", "fullName": "Super Admin",
                      "role": "admin", "status": "active" }
                    """)))
    @ApiResponse(responseCode = "401", description = "Missing or invalid token",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"unauthorized\"}")))
    public Map<String, Object> me(HttpServletRequest request) {
        AuthService.Principal p = principal(request);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", p.userId());
        out.put("email", p.email());
        out.put("fullName", p.fullName());
        out.put("role", p.role());
        out.put("status", "active"); // findValid() only resolves active accounts
        return out;
    }

    private static AuthService.Principal principal(HttpServletRequest request) {
        return (AuthService.Principal) request.getAttribute(AuthInterceptor.PRINCIPAL);
    }

    private Map<?, ?> parseObject(byte[] body) {
        if (body == null || body.length == 0) {
            return Map.of();
        }
        try {
            Object v = json.readValue(new String(body, StandardCharsets.UTF_8), Object.class);
            return v instanceof Map<?, ?> m ? m : Map.of();
        } catch (RuntimeException e) {
            return Map.of();
        }
    }
}
