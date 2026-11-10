package com.medcodeai.imedmock.web;

import com.medcodeai.imedmock.config.TokenStore;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * {@code POST /auth/token} — the guide's client-credentials token request:
 *
 * <pre>
 * POST {BASE_URL}/auth/token
 * Authorization: Basic base64(client_id:client_secret)
 * Content-Type: application/x-www-form-urlencoded
 *
 * grant_type=client_credentials
 * </pre>
 *
 * answered with {@code {"access_token", "token_type": "Bearer", "expires_in"}}.
 * It sits at the host root, NOT under /api/v1, exactly as the guide places it —
 * so it is outside the Bearer gate it feeds.
 *
 * The guide does not say how a refusal looks. The mock's choice: bad or
 * missing client credentials → 401 with the same body every other refusal
 * uses; a wrong grant_type → 400 invalid_request. Credentials are accepted
 * only from the Basic header ("ไม่ส่ง credentials ใน JSON หรือ body").
 */
@RestController
@Tag(name = "Auth — access token",
        description = "Trade client_id/client_secret (Basic auth) for a short-lived Bearer token")
public class AuthTokenController {

    private final TokenStore tokens;

    public AuthTokenController(TokenStore tokens) {
        this.tokens = tokens;
    }

    @PostMapping(path = "/auth/token", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    @SecurityRequirement(name = "basicAuth")
    @Operation(summary = "Get an access token (client credentials)",
            description = "Basic auth with client_id:client_secret, form body "
                    + "`grant_type=client_credentials`. The token goes in "
                    + "`Authorization: Bearer …` on every /api/v1 call and expires after "
                    + "`expires_in` seconds — ask for a new one then.")
    @ApiResponse(responseCode = "200", description = "access_token + token_type Bearer + expires_in")
    @ApiResponse(responseCode = "400", description = "invalid_request — grant_type is not client_credentials")
    @ApiResponse(responseCode = "401", description = "unauthorized — missing or wrong client credentials")
    public ResponseEntity<Map<String, Object>> token(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(name = "grant_type", required = false) String grantType) {
        if (!basicCredentialsMatch(authorization)) {
            Map<String, Object> refused = new LinkedHashMap<>();
            refused.put("message", "unauthorized");
            refused.put("message_th", "ไม่มีสิทธิเข้าถึง");
            return ResponseEntity.status(401).body(refused);
        }
        if (!"client_credentials".equals(grantType)) {
            throw new ApiExceptionHandler.ImedBusinessException(
                    "grant_type must be client_credentials");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("access_token", tokens.issue());
        out.put("token_type", "Bearer");
        out.put("expires_in", tokens.ttl().toSeconds());
        // a token is a credential: no cache may keep a copy (RFC 6749 §5.1)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(out);
    }

    private boolean basicCredentialsMatch(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Basic ", 0, 6)) {
            return false;
        }
        String decoded;
        try {
            decoded = new String(Base64.getDecoder().decode(authorization.substring(6).trim()),
                    StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return false; // not base64 at all
        }
        int colon = decoded.indexOf(':');
        return colon > 0
                && tokens.credentialsMatch(decoded.substring(0, colon), decoded.substring(colon + 1));
    }
}
