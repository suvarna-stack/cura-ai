package com.medcodeai.api.client;

/**
 * The hospital's API failed us: unreachable, refused our credentials,
 * answered an error status, or no longer serves a field we need (R6).
 *
 * Two texts. {@link #publicMessage()} is what the coder's screen shows (our
 * API answers it as a 502 {@code {"error": ...}}): what went wrong, with no
 * host address and no setting names — IMED_API_BASE could even carry
 * credentials in its userinfo. {@link #getMessage()} adds that detail, for the
 * server log only. Extends IllegalStateException so every existing catch site
 * behaves as before.
 */
public class HospitalApiException extends IllegalStateException {
    private static final long serialVersionUID = 1L;

    private final String publicMessage;

    /** {@code detail} (may be null) goes to the log, never to the screen. */
    public HospitalApiException(String publicMessage, String detail, Throwable cause) {
        super(detail == null ? publicMessage : publicMessage + " — " + detail, cause);
        this.publicMessage = publicMessage;
    }

    public HospitalApiException(String message) {
        this(message, null, null);
    }

    public HospitalApiException(String message, Throwable cause) {
        this(message, null, cause);
    }

    /** Safe to show a coder: no address, no setting names. */
    public String publicMessage() {
        return publicMessage;
    }
}
