package com.medcodeai.api.service;

import com.medcodeai.api.repo.AuthSessionRepository;
import com.medcodeai.api.repo.CasesRepository;
import com.medcodeai.api.repo.UsersRepository;
import com.medcodeai.api.web.ApiExceptionHandler.BadRequestException;
import com.medcodeai.api.web.ApiExceptionHandler.ConflictException;
import com.medcodeai.api.web.ApiExceptionHandler.NotFoundException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Admin account management: list / create / update / status / delete, plus the
 * dashboard counts. All responses are hand-built LinkedHashMaps in the project
 * style (stable key order; the repo returns raw column rows, the service shapes
 * them into the API contract).
 *
 * Roles are exactly {coder, admin} (the DB enum). Statuses the UI toggles are
 * {active, inactive}; the enum's third value `suspended` isn't offered here.
 */
@Service
public class AccountService {

    private static final Set<String> ROLES = Set.of("coder", "admin");

    private final UsersRepository users;
    private final AuthSessionRepository sessions;
    private final CasesRepository cases;
    private final PasswordEncoder encoder;
    private final TransactionTemplate tx;

    public AccountService(UsersRepository users, AuthSessionRepository sessions, CasesRepository cases,
                          PasswordEncoder encoder, PlatformTransactionManager txManager) {
        this.users = users;
        this.sessions = sessions;
        this.cases = cases;
        this.encoder = encoder;
        this.tx = new TransactionTemplate(txManager);
    }

    /** Every account, name order — the admin "Accounts" table. */
    public List<Map<String, Object>> list() {
        return users.listAll().stream().map(AccountService::account).toList();
    }

    /** Create a coder/admin account from the "New Account" modal. */
    public Map<String, Object> create(Map<?, ?> b) {
        String fullName = reqString(b, "fullName");
        String email = reqEmail(b);
        String password = reqPassword(b);
        String role = optRole(b);
        int id;
        try {
            id = users.insert(email, fullName, role, "active", encoder.encode(password));
        } catch (DuplicateKeyException e) {
            throw new ConflictException("an account with this email already exists");
        }
        return account(users.findById(id));
    }

    /** Edit an account. Every field is optional; a non-blank password re-hashes. */
    public Map<String, Object> update(int id, Map<?, ?> b) {
        Map<String, Object> existing = users.findById(id);
        if (existing == null) {
            throw new NotFoundException();
        }
        String fullName = b.containsKey("fullName") ? reqString(b, "fullName") : (String) existing.get("full_name");
        String email = b.containsKey("email") ? reqEmail(b) : (String) existing.get("email");
        String role = b.containsKey("role") ? optRole(b) : (String) existing.get("role");
        try {
            users.updateProfile(id, email, fullName, role);
        } catch (DuplicateKeyException e) {
            throw new ConflictException("an account with this email already exists");
        }
        if (b.containsKey("password") && b.get("password") != null) {
            users.updatePassword(id, encoder.encode(reqPassword(b)));
        }
        return account(users.findById(id));
    }

    /** The active/inactive toggle. Deactivating also kills the account's sessions. */
    public Map<String, Object> setStatus(int id, Map<?, ?> b) {
        Object s = b.get("status");
        if (!(s instanceof String status) || !(status.equals("active") || status.equals("inactive"))) {
            throw new BadRequestException("expected {\"status\": \"active\"|\"inactive\"}");
        }
        if (users.findById(id) == null) {
            throw new NotFoundException();
        }
        users.updateStatus(id, status);
        if (status.equals("inactive")) {
            sessions.revokeAllForUser(id);
        }
        return account(users.findById(id));
    }

    /**
     * Delete an account — but only if it never did coding work. An account
     * referenced by the audit trail (assigned codes / history) is protected:
     * we 409 and the admin deactivates instead, so approvals keep their author.
     */
    public Map<String, Object> delete(int id) {
        if (users.findById(id) == null) {
            throw new NotFoundException();
        }
        if (users.hasCodingRefs(id)) {
            throw new ConflictException(
                    "this account has coding history and cannot be deleted — deactivate it instead");
        }
        tx.execute(st -> {
            sessions.deleteForUser(id);
            users.delete(id);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    /** The four dashboard cards. */
    public Map<String, Object> dashboard() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totalCoderAccounts", users.countCoders());
        out.put("activeToday", users.countActiveToday());
        out.put("totalCases", cases.countCases());
        out.put("systemStatus", "operational");
        return out;
    }

    // ---- shaping + validation ----

    /** Raw users row -> contract account object (never carries password_hash). */
    private static Map<String, Object> account(Map<String, Object> r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.get("user_id"));
        m.put("fullName", r.get("full_name"));
        m.put("email", r.get("email"));
        m.put("role", r.get("role"));
        m.put("status", r.get("status"));
        m.put("createdAt", r.get("created_at"));
        m.put("lastLoginAt", r.get("last_login_at"));
        return m;
    }

    private static String reqString(Map<?, ?> b, String key) {
        if (b.get(key) instanceof String s && !s.isBlank()) {
            return s.strip();
        }
        throw new BadRequestException("\"" + key + "\" is required");
    }

    private static String reqEmail(Map<?, ?> b) {
        String e = reqString(b, "email");
        if (!e.contains("@") || e.length() > 100) {
            throw new BadRequestException("a valid email is required");
        }
        return e;
    }

    private static String reqPassword(Map<?, ?> b) {
        if (b.get("password") instanceof String p && p.length() >= 8) {
            return p;
        }
        throw new BadRequestException("password must be at least 8 characters");
    }

    /** role is optional on create (default coder); when present it must be valid. */
    private static String optRole(Map<?, ?> b) {
        if (!b.containsKey("role") || b.get("role") == null) {
            return "coder";
        }
        if (b.get("role") instanceof String s && ROLES.contains(s)) {
            return s;
        }
        throw new BadRequestException("role must be \"coder\" or \"admin\"");
    }
}
