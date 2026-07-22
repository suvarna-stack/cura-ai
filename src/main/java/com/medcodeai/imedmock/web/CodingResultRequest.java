package com.medcodeai.imedmock.web;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.util.List;

/**
 * Body of PUT /api/cases/{tn}/coding-result — the LIMITED write-back the
 * hospital must accept on case finalization.
 *
 * Declared as records rather than a Map so the contract lives in ONE place:
 * the constraints below are what the server enforces AND what the published
 * OpenAPI schema shows the hospital's integrators. (As a Map this endpoint
 * documented itself as `additionalProperties: {}` — i.e. nothing.)
 *
 * Deliberately lenient where the real caller is lenient: only `status` and the
 * MCAI- id rule are required. medcode-api always sends finalizedAt/updatedBy/
 * encounterType, but a null there writes a null column rather than a 400 —
 * same as before this was typed.
 */
@Schema(description = "MedCode AI's approval result for one case")
public record CodingResultRequest(

        @NotBlank(message = "status is required") @Schema(
                description = "Coding status written to MedHack_CaseCodingStatus.coding_status", example = "approved",
                requiredMode = Schema.RequiredMode.REQUIRED) String status,

        @Schema(description = "Stored verbatim — the extracts' datetime formats are non-uniform",
                example = "2026-07-22 12:00:00") String finalizedAt,

        @Schema(description = "Coder who approved the case", example = "web.coder") String updatedBy,

        @Schema(description = "Copied onto every code row written", example = "0") String encounterType,

        @Schema(description = "Finalized codes; replaces all previously submitted MCAI- rows. "
                + "Omitted or empty clears them.") List<@Valid Code> codes) {

    /** The marker separating MedCode AI codes from hospital originals. */
    public static final String MCAI_PREFIX = "MCAI-";

    static final String MCAI_MESSAGE = "every code needs an id prefixed 'MCAI-'";

    /** Never null — an absent `codes` means "no codes", as before. */
    @Override
    public List<Code> codes() {
        return codes == null ? List.of() : codes;
    }

    /** One finalized code row. `type` routes it: procedure → ICD-9, else ICD-10. */
    @Schema(description = "One finalized ICD code")
    public record Code(

            @NotNull(message = MCAI_MESSAGE) @Pattern(regexp = MCAI_PREFIX
                    + ".*",
                    message = MCAI_MESSAGE) @Schema(
                            description = "Row id; MUST carry the MCAI- prefix so hospital-entered "
                                    + "codes stay distinguishable from ours",
                            example = "MCAI-123", requiredMode = Schema.RequiredMode.REQUIRED) String id,

            @Schema(description = "The ICD code itself", example = "E11.9") String icd,

            @Schema(description = "Code description", example = "Type 2 diabetes") String name,

            @Schema(description = "'procedure' routes to MedHack_Procedure(ICD9); "
                    + "anything else to MedHack_Diagnosis(ICD10)", example = "diagnosis",
                    allowableValues = {
                            "diagnosis", "procedure"}) String type,

            @Schema(description = "iMed vocabulary, stored verbatim; diagnoses only", example = "PRIMARY_DIAGNOSIS",
                    allowableValues = {
                            "PRIMARY_DIAGNOSIS", "COMORBIDITY", "OTHERS",
                            "EXTERNAL_CAUSE_OF_INJURY"}) String diagnosisType) {

        /** hidden: a helper, not a field integrators may send. */
        @Schema(hidden = true)
        public boolean isProcedure() {
            return "procedure".equals(type);
        }
    }
}
