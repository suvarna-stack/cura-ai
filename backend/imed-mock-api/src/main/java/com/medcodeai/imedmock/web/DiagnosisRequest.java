package com.medcodeai.imedmock.web;

import java.util.List;

/**
 * Request body of POST /api/v1/diagnosis and PUT /api/v1/diagnosis/{visit_id}
 * — exactly the field set the hospital's Medihack API guide for MedCode
 * (4 Nov 2026) accepts, and nothing more. The hospital's earlier write PDF
 * (rev 1, 24 Jul 2026) listed many more fields (doctor_eid, base_clinic_id,
 * comments, the IPD clinical-discharge texts, …); the guide narrows that to
 * this set and answers 400 for anything else, so the mock does too — the
 * unknown-key check runs on the raw body in DiagnosisApiController, before
 * this record is bound.
 *
 * Record components are deliberately snake_case so the JSON property names
 * AND the published OpenAPI schema match the guide exactly — no
 * naming-strategy config to drift. Validation is conditional (POST vs PUT,
 * OPD vs IPD), so it lives in DiagnosisApiController, not in bean annotations.
 */
public record DiagnosisRequest(
        String request_id,
        String object_id, // the visit_id
        String fix_visit_type_id,
        String doctor_discharge,
        String coding_status, // "approved" | "open"; optional
        List<Icd10Row> diagnosis_icd10,
        List<Icd9Row> diagnosis_icd9,
        DischargeOpd doctor_discharge_opd,
        DischargeIpd doctor_discharge_ipd) {

    /** POST: everything but object_id. PUT: object_id + the fields being changed. */
    public record Icd10Row(
            String object_id,
            String icd10_code,
            String icd10_description,
            String beginning_diagnosis,
            String fix_diagnosis_type_id,
            String fix_dx_source, // POST only, always "MED_DC"
            String coder_eid) { // POST only
    }

    /** POST: everything but object_id. PUT: object_id + the fields being changed. */
    public record Icd9Row(
            String object_id,
            String icd9_code,
            String icd9_description,
            String beginning_operation,
            String fix_operation_type_id, // POST only (create-only on the hospital side)
            String is_from, // POST only, always "MED_DC"
            String date_in,
            String time_in,
            String date_out,
            String time_out) {
    }

    /** POST only — PUT carries no discharge object. */
    public record DischargeOpd(String fix_opd_discharge_status_id) {
    }

    /** POST only — PUT carries no discharge object. */
    public record DischargeIpd(
            String fix_ipd_discharge_status_id,
            String fix_ipd_discharge_type_id,
            String is_from) { // always "MED_DC"
    }
}
