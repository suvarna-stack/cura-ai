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
 * - The mock-only demo tooling (/api/demo/**) keeps {"error": "..."} — same
 *   shape as medcode-api, one convention across both services.
 * - The guide's routes (/auth/token, /api/v1/**) answer in the hospital's own
 *   envelope: {"status": "STATUS_BUSINESS_ERROR", "message", "message_th"}
 *   for 400/409/422 (401 has the slightly different no-status shape, emitted
 *   by ApiV1AuthInterceptor and AuthTokenController). The mock adds a
 *   "detail" key on 400s as a debugging aid — mock-only, the real API sends
 *   none.
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

    /**
     * 422 in the real API's envelope, with the contract's own message word:
     * too_many_visit_ids (R2 batch cap) and period_too_long (R3 window cap).
     * Unlike the 400 above, the message is the CALLER's diagnostic, so no
     * mock-only detail key is added.
     */
    public static class ImedUnprocessableException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private final transient String messageTh;

        public ImedUnprocessableException(String message, String messageTh) {
            super(message);
            this.messageTh = messageTh;
        }

        public String messageTh() {
            return messageTh;
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

    @ExceptionHandler(ImedUnprocessableException.class)
    public ResponseEntity<Map<String, Object>> imedUnprocessable(ImedUnprocessableException e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "STATUS_BUSINESS_ERROR");
        m.put("message", e.getMessage());
        m.put("message_th", e.messageTh());
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_CONTENT).body(m);
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

    /**
     * Unparseable JSON, or a body of the wrong shape (an array where an object
     * belongs). Every route that takes a body is a guide route now, so this
     * answers in the guide's 400 envelope ("JSON เสีย" is listed as a 400).
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> unreadableBody() {
        return imedBusinessError(new ImedBusinessException("malformed request body"));
    }

    private static ResponseEntity<Map<String, Object>> body(HttpStatus status, String error) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", error);
        return ResponseEntity.status(status).body(m);
    }
}
