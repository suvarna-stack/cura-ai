package com.medcodeai.api.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Error bodies byte-matching Flask's: {"error": "..."} with 404/400. The
 * write controllers parse request JSON manually (Flask's get_json(silent=True)
 * semantics) and throw BadRequestException with the exact Flask message, so
 * Spring's default error page never leaks into the contract.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    public static class NotFoundException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }

    public static class BadRequestException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public BadRequestException(String message) {
            super(message);
        }
    }

    /** 401 — no/invalid/expired Bearer token (thrown by AuthInterceptor and login). */
    public static class UnauthorizedException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public UnauthorizedException(String message) {
            super(message);
        }
    }

    /** 403 — authenticated but not permitted (a non-admin hitting /api/admin/**). */
    public static class ForbiddenException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public ForbiddenException(String message) {
            super(message);
        }
    }

    /** 409 — the request conflicts with existing state (duplicate email, or a
     *  delete blocked because the account has coding history). */
    public static class ConflictException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public ConflictException(String message) {
            super(message);
        }
    }

    /** 429 — too many requests (login rate limiter tripped). */
    public static class TooManyRequestsException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public TooManyRequestsException(String message) {
            super(message);
        }
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound() {
        return body(HttpStatus.NOT_FOUND, "not found");
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<Map<String, Object>> badRequest(BadRequestException e) {
        return body(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<Map<String, Object>> unauthorized(UnauthorizedException e) {
        return body(HttpStatus.UNAUTHORIZED, e.getMessage());
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<Map<String, Object>> forbidden(ForbiddenException e) {
        return body(HttpStatus.FORBIDDEN, e.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Map<String, Object>> conflict(ConflictException e) {
        return body(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(TooManyRequestsException.class)
    public ResponseEntity<Map<String, Object>> tooManyRequests(TooManyRequestsException e) {
        return body(HttpStatus.TOO_MANY_REQUESTS, e.getMessage());
    }

    private static ResponseEntity<Map<String, Object>> body(HttpStatus status, String error) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", error);
        return ResponseEntity.status(status).body(m);
    }
}
