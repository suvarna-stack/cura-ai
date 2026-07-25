package com.medcodeai.imedmock.web;

import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * Two error conventions live side by side, deliberately:
 *
 * - The extract READ endpoints keep {"error": "..."} with 404/400 — same
 *   shape as medcode-api, one convention across both services.
 * - The real-shaped /api/v1 write endpoints answer in the hospital's own
 *   envelope from the "iMed Diagnosis and Medical Discharge API" PDF:
 *   {"status": "STATUS_BUSINESS_ERROR", "message", "message_th"} for 400/409
 *   (401 is emitted by ApiV1AuthInterceptor with its slightly different
 *   no-status shape). The mock adds a "detail" key on 400s as a debugging
 *   aid — documented as mock-only, the real API sends none.
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

    /** 400 in the real API's envelope; `detail` is the mock-only diagnostic. */
    public static class ImedBusinessException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public ImedBusinessException(String detail) {
            super(detail);
        }
    }

    /** 409 DIAGNOSIS_CODE_ALREADY_EXIST, verbatim from the PDF. */
    public static class DuplicateDiagnosisException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }

    @ExceptionHandler(ImedBusinessException.class)
    public ResponseEntity<Map<String, Object>> imedBusinessError(ImedBusinessException e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "STATUS_BUSINESS_ERROR");
        m.put("message", "invalid_request");
        m.put("message_th", "ข้อมูลไม่ครบหรือไม่ถูกต้อง");
        m.put("detail", e.getMessage()); // mock-only aid; absent from the real API
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(m);
    }

    @ExceptionHandler(DuplicateDiagnosisException.class)
    public ResponseEntity<Map<String, Object>> duplicateDiagnosis() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "STATUS_BUSINESS_ERROR");
        m.put("message", "DIAGNOSIS_CODE_ALREADY_EXIST");
        m.put("message_th", "พบรหัส ICD-10 ซ้ำสำหรับ visit และแพทย์เดียวกัน");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(m);
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound() {
        return body(HttpStatus.NOT_FOUND, "not found");
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<Map<String, Object>> badRequest(BadRequestException e) {
        return body(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    /**
     * Constraint violations on @Valid request bodies. Messages are de-duplicated
     * and sorted so the same bad payload always yields the same error string —
     * one violation reads as a plain sentence, several are joined with "; ".
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> invalidBody(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getAllErrors().stream()
                .map(DefaultMessageSourceResolvable::getDefaultMessage)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(TreeSet::new))
                .stream()
                .collect(Collectors.joining("; "));
        return body(HttpStatus.BAD_REQUEST, message.isEmpty() ? "invalid request body" : message);
    }

    /** Unparseable JSON, or a value of the wrong shape (object where text is expected). */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> unreadableBody(HttpMessageNotReadableException e) {
        return body(HttpStatus.BAD_REQUEST, "malformed request body");
    }

    private static ResponseEntity<Map<String, Object>> body(HttpStatus status, String error) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", error);
        return ResponseEntity.status(status).body(m);
    }
}
