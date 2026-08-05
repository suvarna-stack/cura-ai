-- Manual mirror of config/SchemaBootstrap.java (the runner applies this
-- idempotently at every startup; this file exists for reference and for
-- environments where you want to run the DDL by hand).
--
-- Context: updated_at backs GET /api/cases?changed_since= — the visit-level
-- "changed since" filter MedCode AI asked for (open question 16 in
-- medcode-api's docs/imed-integration.md). Every /api/v1 write (create,
-- update, cancel) stamps the touched row; seed rows keep NULL and the filter
-- falls back to the visit datetime (admissiondatetime, else the datetime
-- encoded in the transaction number).

ALTER TABLE imed.medhack_diagnosis_icd10 ADD COLUMN IF NOT EXISTS updated_at text;
ALTER TABLE imed.medhack_procedure_icd9  ADD COLUMN IF NOT EXISTS updated_at text;

-- A demo baseline snapshotted before this column existed must grow it too:
-- /api/demo/reset refills live tables positionally (INSERT ... SELECT *).
ALTER TABLE IF EXISTS imed_baseline.medhack_diagnosis_icd10 ADD COLUMN IF NOT EXISTS updated_at text;
ALTER TABLE IF EXISTS imed_baseline.medhack_procedure_icd9  ADD COLUMN IF NOT EXISTS updated_at text;
