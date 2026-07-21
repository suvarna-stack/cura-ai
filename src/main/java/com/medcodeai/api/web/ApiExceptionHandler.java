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

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound() {
        return body(HttpStatus.NOT_FOUND, "not found");
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<Map<String, Object>> badRequest(BadRequestException e) {
        return body(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    private static ResponseEntity<Map<String, Object>> body(HttpStatus status, String error) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", error);
        return ResponseEntity.status(status).body(m);
    }
}
