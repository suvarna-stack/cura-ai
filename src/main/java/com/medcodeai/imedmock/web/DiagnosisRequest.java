package com.medcodeai.imedmock.web;

import java.util.List;

/**
 * Request body of POST /api/v1/diagnosis and PUT /api/v1/diagnosis/{visit_id},
 * field-for-field from the hospital's "iMed Diagnosis and Medical Discharge
 * API" PDF (rev 1, 24 Jul 2026). Record components are deliberately snake_case
 * so the JSON property names AND the published OpenAPI schema match the
 * hospital contract exactly — no naming-strategy config to drift.
 *
 * Validation is conditional (POST vs PUT, OPD vs IPD), so it lives in
 * DiagnosisApiController.validate(), not in bean annotations.
 *
 * One field is NOT from the PDF: `coding_status`, our proposed extension for
 * the coding workflow state on the visit row (see DiagnosisApiController and
 * db/migrations/0005_coding_status.sql). It is optional everywhere, so a
 * caller speaking the hospital's contract exactly is unaffected.
 */
public record DiagnosisRequest(
        String request_id,
        String object_id, // the visit_id
        String fix_visit_type_id,
        String doctor_discharge,
        String coding_status, // medcode extension — see DiagnosisApiController
        List<Icd10Row> diagnosis_icd10,
        List<Icd9Row> diagnosis_icd9,
        DischargeOpd doctor_discharge_opd,
        DischargeIpd doctor_discharge_ipd) {

    public record Icd10Row(
            String object_id,
            String icd10_code,
            String icd10_description,
            String fix_diagnosis_type_id,
            String doctor_eid,
            String base_clinic_id,
            String diagnosis_date,
            String diagnosis_time,
            String comments,
            String beginning_diagnosis,
            String beginning_diagnosis_th,
            String fix_dx_source,
            String is_secret,
            String coder_eid,
            String is_chronic,
            String is_disease_surveillance,
            String is_personal_illness,
            String patient_id,
            String row_index) {
    }

    public record Icd9Row(
            String object_id,
            String icd9_code,
            String icd9_description,
            String fix_operation_type_id,
            String doctor_eid,
            String base_clinic_id,
            String date_in,
            String time_in,
            String date_out,
            String time_out,
            String comments,
            String beginning_operation,
            String beginning_operation_th,
            String extension_code,
            String order_item_id,
            String is_from,
            String row_index) {
    }

    public record DischargeOpd(
            String object_id,
            String fix_opd_discharge_status_id,
            String base_doctor_discharge_type_id,
            String note) {
    }

    public record DischargeIpd(
            String object_id,
            String discharge_doctor_eid,
            String fix_ipd_discharge_status_id,
            String fix_ipd_discharge_type_id,
            String note,
            String reason_admission,
            String physical_examination,
            String diagnostic,
            String investigation,
            String hospital_course,
            String treatment,
            String plan_or_advice,
            String discharge_instruction,
            String is_follow_up,
            String is_from) {
    }
}
