package com.medcodeai.api.web;

import com.medcodeai.api.service.AuthService;
import com.medcodeai.api.service.CaseFieldSettingsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Which identifier fields the case list may show (2026-08-25).
 *
 * <p>Two routes on purpose, with two different guards:
 * <ul>
 *   <li>{@code GET /api/case-field-settings} — <b>any</b> signed-in account.
 *       The coder list has to know what to render, so a coder must be able to
 *       read it.
 *   <li>{@code PUT /api/admin/case-field-settings} — admin only, enforced by
 *       AuthInterceptor's /api/admin/** rule. Setting site policy is the
 *       administrator's job.
 * </ul>
 *
 * <p>Body parsing follows AdminController: raw bytes parsed here, so malformed
 * JSON becomes our own {"error": …} 400 rather than Spring's.
 */
@RestController
@Tag(name = "settings", description = "Administrator-set display configuration")
@SecurityRequirement(name = "bearerAuth")
public class CaseFieldSettingsController {

    private static final String EXAMPLE = "{\"vn\": true, \"hn\": true, \"name\": false}";

    private final CaseFieldSettingsService settings;
    private final JsonMapper json = new JsonMapper();

    public CaseFieldSettingsController(CaseFieldSettingsService settings) {
        this.settings = settings;
    }

    @GetMapping("/api/case-field-settings")
    @Operation(summary = "Which case-list identifier fields are shown",
            description = "Readable by any signed-in account — the coder list needs it to know "
                    + "what to render. Always returns all three keys.\n\n"
                    + "These govern **display only**: the case payload still carries every "
                    + "value, because case detail, search and the audit trail need them.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = EXAMPLE)))
    public Map<String, Object> get() {
        return settings.get();
    }

    @PutMapping("/api/admin/case-field-settings")
    @Operation(summary = "Turn case-list identifier fields on or off",
            description = "Admin only. Send only the switches you are changing — keys you omit "
                    + "keep their current value. An unknown key, or a value that is not a JSON "
                    + "boolean, is a `400` and changes nothing.\n\n"
                    + "Returns the full settings object as it now stands.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = EXAMPLE)))
    @ApiResponse(responseCode = "400", description = "Unknown field or non-boolean value",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"unknown field: age\"}")))
    public Map<String, Object> update(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(type = "object"),
                            examples = @ExampleObject(value = "{\"hn\": false}")))
            @RequestBody(required = false) byte[] body,
            HttpServletRequest request) {
        Map<String, Object> updates = parseObject(body);
        Object principal = request.getAttribute(AuthInterceptor.PRINCIPAL);
        String by = principal instanceof AuthService.Principal p ? p.email() : "";
        try {
            return settings.update(updates, by);
        } catch (CaseFieldSettingsService.ApiBadField e) {
            throw new ApiExceptionHandler.BadRequestException(e.getMessage());
        }
    }

    /** {} for an absent body; a 400 for anything that is not a JSON object. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseObject(byte[] body) {
        if (body == null || body.length == 0) {
            return new LinkedHashMap<>();
        }
        Object v;
        try {
            v = json.readValue(new String(body, StandardCharsets.UTF_8), Object.class);
        } catch (RuntimeException e) {
            throw new ApiExceptionHandler.BadRequestException("body must be a JSON object");
        }
        if (!(v instanceof Map)) {
            throw new ApiExceptionHandler.BadRequestException("body must be a JSON object");
        }
        return new LinkedHashMap<>((Map<String, Object>) v);
    }
}
