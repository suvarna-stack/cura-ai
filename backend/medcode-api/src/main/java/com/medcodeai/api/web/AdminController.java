package com.medcodeai.api.web;

import com.medcodeai.api.service.AccountService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Admin dashboard endpoints — account management + the dashboard cards. Every
 * route here is under /api/admin/**, which AuthInterceptor guards with a valid
 * Bearer token AND the admin role (401 without a token, 403 for a coder token).
 *
 * Bodies are parsed manually from raw bytes (CasesWriteController style) so
 * malformed JSON yields our own {"error": ...} 400. Account ids arrive as path
 * strings and are parsed to int here; a non-numeric id is a 404.
 */
@RestController
@Tag(name = "admin", description = "Account management + dashboard (admin only)")
@SecurityRequirement(name = "bearerAuth") // every /api/admin/** route needs an admin token
public class AdminController {

    private static final String NEW_ACCOUNT_EXAMPLE =
            "{\"fullName\": \"Naret Pichitporn\", \"email\": \"naret.p@hospital.th\", "
                    + "\"password\": \"s3cret-pass\", \"role\": \"coder\"}";
    private static final String ACCOUNT_EXAMPLE = """
            { "id": 3, "fullName": "Naret Pichitporn", "email": "naret.p@hospital.th",
              "role": "coder", "status": "active",
              "createdAt": "2026-07-24 09:12:03", "lastLoginAt": null }
            """;

    private final AccountService accounts;
    private final JsonMapper json = new JsonMapper();

    public AdminController(AccountService accounts) {
        this.accounts = accounts;
    }

    @GetMapping("/api/admin/accounts")
    @Operation(summary = "List accounts",
            description = "Every account (coders and admins), name order. Each object omits the "
                    + "password. The frontend's \"Total Coder Accounts\" counts `role == \"coder\"`.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = "[" + ACCOUNT_EXAMPLE + "]")))
    public List<Map<String, Object>> listAccounts() {
        return accounts.list();
    }

    @PostMapping("/api/admin/accounts")
    @Operation(summary = "Create an account",
            description = "The \"New Account\" modal. `role` defaults to `coder` (must be `coder` "
                    + "or `admin`); `password` is stored BCrypt-hashed. `409` if the email is taken.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = ACCOUNT_EXAMPLE)))
    @ApiResponse(responseCode = "400", description = "Missing/invalid field",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"password must be at least 8 characters\"}")))
    @ApiResponse(responseCode = "409", description = "Email already exists",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"an account with this email already exists\"}")))
    public Map<String, Object> createAccount(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(type = "object"),
                            examples = @ExampleObject(value = NEW_ACCOUNT_EXAMPLE)))
            @RequestBody(required = false) byte[] body) {
        return accounts.create(parseObject(body));
    }

    @PutMapping("/api/admin/accounts/{id}")
    @Operation(summary = "Edit an account",
            description = "All fields optional: `fullName`, `email`, `role`, `password` (a non-blank "
                    + "`password` re-hashes). `404` unknown id, `409` if the new email is taken.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = ACCOUNT_EXAMPLE)))
    public Map<String, Object> updateAccount(@PathVariable String id,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(type = "object"),
                            examples = @ExampleObject(
                                    value = "{\"fullName\": \"Naret P.\", \"role\": \"admin\"}")))
            @RequestBody(required = false) byte[] body) {
        return accounts.update(parseId(id), parseObject(body));
    }

    @PutMapping("/api/admin/accounts/{id}/status")
    @Operation(summary = "Activate / deactivate an account",
            description = "The status toggle. Deactivating (`inactive`) also revokes the account's "
                    + "live sessions, so its token stops working at once. `404` unknown id.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = ACCOUNT_EXAMPLE)))
    @ApiResponse(responseCode = "400", description = "status not active/inactive",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"expected {\\\"status\\\": \\\"active\\\"|\\\"inactive\\\"}\"}")))
    public Map<String, Object> updateStatus(@PathVariable String id,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json",
                            schema = @Schema(type = "object"),
                            examples = @ExampleObject(value = "{\"status\": \"inactive\"}")))
            @RequestBody(required = false) byte[] body) {
        return accounts.setStatus(parseId(id), parseObject(body));
    }

    @DeleteMapping("/api/admin/accounts/{id}")
    @Operation(summary = "Delete an account",
            description = "Hard-deletes an account **only if it never did coding work**. An account "
                    + "referenced by the audit trail is protected: `409`, and the admin deactivates "
                    + "it instead (so approvals keep their author). `404` unknown id.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = "{\"ok\": true}")))
    @ApiResponse(responseCode = "409", description = "Account has coding history",
            content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"error\": \"this account has coding history and cannot be deleted — deactivate it instead\"}")))
    public Map<String, Object> deleteAccount(@PathVariable String id) {
        return accounts.delete(parseId(id));
    }

    @GetMapping("/api/admin/dashboard")
    @Operation(summary = "Dashboard cards",
            description = "The four summary cards: coder-account count, accounts active today "
                    + "(logged in today), total cases in the system, and system status.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = """
                    { "totalCoderAccounts": 6, "activeToday": 3,
                      "totalCases": 1101, "systemStatus": "operational" }
                    """)))
    public Map<String, Object> dashboard() {
        return accounts.dashboard();
    }

    /** Non-numeric ids are simply unknown accounts. */
    private static int parseId(String id) {
        try {
            return Integer.parseInt(id);
        } catch (NumberFormatException e) {
            throw new ApiExceptionHandler.NotFoundException();
        }
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
