-- 2026-07-30: two hospital-UI elements carried into medcode (the hospital asked
-- our app to show the same fields its own coder UI shows).
--
-- 1) case_codes.operation_type — the extract's operationtype on ICD-9 procedure
--    rows ("OR Procedure" / "NON OR Procedure" / "OTH" / "GENERAL_OPERATION"),
--    stored verbatim, null on ICD-10 rows (guarded in both insert paths, same
--    rule as operation_start/_end). When present it also feeds the write-back's
--    fix_operation_type_id instead of the GENERAL_OPERATION placeholder.
--
-- 2) case_vitals — the extract's medhack_vitalsign readings (the strip above
--    CC/PI/PE in the hospital UI). Hospital-sourced: sync refresh deletes and
--    reinserts, coders never write here. Raw text verbatim; blanks → null.
--
-- Applied idempotently by config/SchemaBootstrap at startup; this file is the
-- reviewable mirror, like 0004.

ALTER TABLE case_codes ADD COLUMN IF NOT EXISTS operation_type text;

CREATE TABLE IF NOT EXISTS case_vitals (
    vital_id          serial PRIMARY KEY,
    case_id           varchar(50) NOT NULL,
    measured_at       text,
    temperature       text,
    systolic          text,
    diastolic         text,
    heart_rate        text,
    oxygen_saturation text,
    weight            text,
    height            text
);
CREATE INDEX IF NOT EXISTS case_vitals_case_idx ON case_vitals (case_id);
