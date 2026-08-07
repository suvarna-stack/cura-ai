-- Manual mirror of config/SchemaBootstrap.java (the runner applies this
-- idempotently at every startup; this file exists for reference and for
-- environments where you want to run the DDL by hand).
--
-- Context: coding_status is the visit's MEDICAL-CODING workflow state, the
-- hospital-side twin of medcode's own cases.case_status. MedCode AI sets it
-- to 'approved' when a coder signs the codes off and clears it on reopen,
-- through the new `coding_status` field of POST/PUT /api/v1/diagnosis.
--
-- It exists because the approval marker used to ride on
-- medhack_patient.dischargestatus, which is the DOCTOR's clinical discharge
-- outcome ("Improved", "Not Improved", ...) — not ours to overwrite. Since
-- this column landed, the /api/v1 writes leave dischargestatus alone.
--
-- Our extension, not in the hospital's API PDF: it needs their agreement
-- before the real iMed can serve it (open question 17 in medcode-api's
-- docs/imed-integration.md). The read side needs no change — GET /api/cases
-- serves the whole visit row, so the column ships with it automatically.

ALTER TABLE imed.medhack_patient ADD COLUMN IF NOT EXISTS coding_status text;

-- A demo baseline snapshotted before this column existed must grow it too:
-- /api/demo/reset refills live tables positionally (INSERT ... SELECT *).
ALTER TABLE IF EXISTS imed_baseline.medhack_patient ADD COLUMN IF NOT EXISTS coding_status text;
