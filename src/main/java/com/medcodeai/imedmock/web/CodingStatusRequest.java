package com.medcodeai.imedmock.web;

/**
 * Request body of PUT /api/v1/coding-status/{visit_id} — OUR proposed
 * mini-contract (the hospital's diagnosis/discharge PDF has no coding-status
 * concept; they agreed to add a coding-status table, and this endpoint is the
 * shape we propose for writing it). Style deliberately matches their API:
 * snake_case fields, request_id dedup, Bearer auth, same response envelope.
 */
public record CodingStatusRequest(
        String request_id,
        String coding_status,
        String finalized_at,
        String updated_by) {
}
