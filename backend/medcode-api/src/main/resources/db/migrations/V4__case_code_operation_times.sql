-- V4 — operation time window on case_codes (2026-07-30)
--
-- An ICD-9 code is a procedure, and a procedure happens over a time window.
-- The hospital records it on both of its surfaces (extract
-- medhack_procedure_icd9.startdatetime/enddatetime; write API
-- date_in/time_in/date_out/time_out) — these columns let medcode carry it
-- through instead of dropping it: sync imports it, coders edit it, approve
-- writes it back.
--
-- text, not timestamp: datetimes in this schema stay raw strings end-to-end
-- (the JDBC layer never parses them). Format "YYYY-MM-DD HH:MM:SS", nullable;
-- always null on ICD-10 (diagnosis) rows.

ALTER TABLE case_codes ADD COLUMN IF NOT EXISTS operation_start text;
ALTER TABLE case_codes ADD COLUMN IF NOT EXISTS operation_end text;
