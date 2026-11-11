package com.medcodeai.api.client;

/**
 * The hospital's API failed us: unreachable, refused our credentials,
 * answered an error status, or no longer serves a field we need (R6).
 *
 * The message is written for a person — the API answers it as a 502 with
 * {@code {"error": message}}, and the coder's screen shows it — so it says
 * what went wrong and where to look. Extends IllegalStateException so every
 * existing catch site behaves as before.
 */
public class HospitalApiException extends IllegalStateException {
    private static final long serialVersionUID = 1L;

    public HospitalApiException(String message) {
        super(message);
    }

    public HospitalApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
