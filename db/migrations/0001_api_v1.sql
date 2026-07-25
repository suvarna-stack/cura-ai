-- Manual mirror of config/SchemaBootstrap.java (the runner applies this
-- idempotently at every startup; this file exists for reference and for
-- environments where you want to run the DDL by hand).
--
-- Context: the /api/v1 write surface (real iMed diagnosis/discharge contract
-- + our proposed coding-status extension) needs these on top of the frozen
-- extract seed (db/seed.sql.gz — data, not build output, never edit).

ALTER TABLE imed.medhack_diagnosis_icd10 ADD COLUMN IF NOT EXISTS is_cancelled text;
ALTER TABLE imed.medhack_procedure_icd9  ADD COLUMN IF NOT EXISTS is_cancelled text;

CREATE TABLE IF NOT EXISTS imed.imed_request_log (
    request_id text PRIMARY KEY,
    endpoint   text,
    response   text,
    created_at text
);

CREATE TABLE IF NOT EXISTS imed.doctor_discharge_opd (
    object_id                     text PRIMARY KEY,
    transactionnumber             text NOT NULL,
    fix_opd_discharge_status_id   text,
    base_doctor_discharge_type_id text,
    note                          text
);

CREATE TABLE IF NOT EXISTS imed.doctor_discharge_ipd (
    object_id                   text PRIMARY KEY,
    transactionnumber           text NOT NULL,
    discharge_doctor_eid        text,
    fix_ipd_discharge_status_id text,
    fix_ipd_discharge_type_id   text,
    note                        text,
    reason_admission            text,
    physical_examination        text,
    diagnostic                  text,
    investigation               text,
    hospital_course             text,
    treatment                   text,
    plan_or_advice              text,
    discharge_instruction       text,
    is_follow_up                text,
    is_from                     text
);
