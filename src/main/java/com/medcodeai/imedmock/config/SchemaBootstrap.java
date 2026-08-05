package com.medcodeai.imedmock.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.FileCopyUtils;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;

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
 * - icd_10 / icd_9: the hospital's ICD reference catalogs (code master).
 *   Outside the frozen dump, so both table AND data self-heal here: created
 *   if missing, seeded from db/icd_catalog_seed.sql when empty (the resource
 *   is ON CONFLICT DO NOTHING throughout, so re-running is safe). MedCode AI
 *   pulls these via GET /api/icd10-codes / /api/icd9-codes during sync.
 *
 * Manual mirror of this DDL: db/migrations/0001_api_v1.sql,
 * db/migrations/0002_icd_catalog.sql, db/migrations/0003_updated_at.sql.
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
        // updated_at backs the list endpoint's changed_since filter (the
        // "changed since" ask to the hospital, mocked here first). Seed rows
        // keep it NULL — their change time is the visit itself, and the filter
        // falls back to the visit datetime. Stamped by every /api/v1 write.
        jdbc.execute("ALTER TABLE imed.medhack_diagnosis_icd10 ADD COLUMN IF NOT EXISTS updated_at text");
        jdbc.execute("ALTER TABLE imed.medhack_procedure_icd9 ADD COLUMN IF NOT EXISTS updated_at text");
        // A demo baseline snapshotted BEFORE this column existed must grow it
        // too: /api/demo/reset refills live tables with positional
        // INSERT … SELECT *, which breaks on a column-count mismatch.
        for (String t : List.of("medhack_diagnosis_icd10", "medhack_procedure_icd9")) {
            if (baselineTableExists(t)) {
                jdbc.execute("ALTER TABLE imed_baseline." + t + " ADD COLUMN IF NOT EXISTS updated_at text");
            }
        }
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
                CREATE TABLE IF NOT EXISTS imed.icd_10 (
                    code        text PRIMARY KEY,
                    description text
                )""");
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS imed.icd_9 (
                    code        text PRIMARY KEY,
                    description text
                )""");
        seedIcdCatalogsIfEmpty();
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

    private boolean baselineTableExists(String table) {
        return !jdbc.queryForList(
                "SELECT 1 FROM pg_tables WHERE schemaname = 'imed_baseline' AND tablename = ?",
                table).isEmpty();
    }

    /**
     * Load the committed catalog rows on first boot (or after a re-seed from
     * the dump wiped the tables). The script is one INSERT … ON CONFLICT DO
     * NOTHING per code, so partial earlier loads can't break it; the empty
     * check just skips the work on every normal startup.
     */
    private void seedIcdCatalogsIfEmpty() {
        Integer rows = jdbc.queryForObject(
                "SELECT (SELECT count(*) FROM imed.icd_10) + (SELECT count(*) FROM imed.icd_9)",
                Integer.class);
        if (rows != null && rows > 0) {
            return;
        }
        try (InputStreamReader in = new InputStreamReader(
                new ClassPathResource("db/icd_catalog_seed.sql").getInputStream(),
                StandardCharsets.UTF_8)) {
            jdbc.execute(FileCopyUtils.copyToString(in));
        } catch (java.io.IOException e) {
            throw new IllegalStateException("failed to read db/icd_catalog_seed.sql", e);
        }
    }
}
