package com.medcodeai.imedmock.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Idempotent startup DDL for everything the real-shaped /api/v1 write API
 * needs on top of the frozen extract seed (db/seed.sql.gz is data, not build
 * output — never edit the dump; see medcode-api's SchemaBootstrap for the
 * same pattern and rationale).
 *
 * - is_cancelled on the two code tables: the real iMed DELETE is a CANCEL
 *   flow (audit trail, no hard delete), so cancelled rows stay and reads
 *   filter them out.
 * - imed_request_log: the real API dedups by the third party's request_id —
 *   replaying a request returns the stored response instead of re-executing.
 * - doctor_discharge_opd / _ipd: the real POST bundles medical-discharge
 *   data with the diagnosis rows in one transaction.
 *
 * Manual mirror of this DDL: db/migrations/0001_api_v1.sql.
 */
@Component
public class SchemaBootstrap implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public SchemaBootstrap(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbc.execute("ALTER TABLE imed.medhack_diagnosis_icd10 ADD COLUMN IF NOT EXISTS is_cancelled text");
        jdbc.execute("ALTER TABLE imed.medhack_procedure_icd9 ADD COLUMN IF NOT EXISTS is_cancelled text");
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS imed.imed_request_log (
                    request_id text PRIMARY KEY,
                    endpoint   text,
                    response   text,
                    created_at text
                )""");
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS imed.doctor_discharge_opd (
                    object_id                     text PRIMARY KEY,
                    transactionnumber             text NOT NULL,
                    fix_opd_discharge_status_id   text,
                    base_doctor_discharge_type_id text,
                    note                          text
                )""");
        jdbc.execute("""
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
                )""");
    }
}
