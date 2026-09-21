# Appendix A — API reference

The authoritative API contract lives in the codebase, not duplicated here —
`medcode-api/docs/api-contract.md` (1,018 lines) is hand-maintained and
described by its own header as "the source of truth," checked against
`CasesApiIntegrationTest` in the same commit whenever a response shape
changes. Reproducing it in this appendix would mean two copies drifting
apart, so this appendix indexes it instead.

## Endpoint index (33 endpoints)

| Endpoint | Purpose |
|---|---|
| `GET /api/health`, `GET /api/healthz` | Liveness probes |
| `GET /api/cases` | Dashboard payload (four buckets: complete/incomplete/reopened/finished) |
| `GET /api/cases/{caseId}` | Case detail (chart + codes) |
| `PUT /api/cases/{caseId}/codes` | Save the coder's working code list |
| `POST /api/cases/approve` | Approve codes, write back to iMed |
| `POST /api/cases/{caseId}/reopen` | Reopen a finished case |
| `POST /api/cases/{caseId}/lock`, `DELETE .../lock` | One-coder-per-case lock |
| `POST /api/cases/{caseId}/star`, `DELETE .../star` | Mark a case important |
| `POST /api/demo/snapshot`, `POST /api/demo/reset` | Demo baseline snapshot/restore |
| `POST /api/sync` | Pull case data from the hospital (windowed) |
| `POST /api/cases/{caseId}/sync` | Sync one case |
| `POST /api/cases/{caseId}/suggest-codes` | RAG code suggestions |
| `GET /api/icd-codes` | ICD catalog typeahead |
| `GET /api/case-field-settings`, `PUT /api/admin/case-field-settings` | Which identifier fields the case list shows |
| `GET /api/analytics` | Analytics page payload |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Auth |
| `GET/POST/PUT/DELETE /api/admin/accounts...` | Account management (admin) |
| `GET /api/admin/dashboard` | Admin dashboard cards |
| `/api/admin/knowledge/**` | AI Training / RAG proxy (admin) |
| `/api/agent/chat`, `/api/agent/chat/stream` | Coder AI Agent chat (+ streaming) |
| `/api/agent/learn/**` | Suggest & Learn (coder-taught rules) |

Full request/response shapes, error codes, and the auth model are in
`medcode-api/docs/api-contract.md`.

## Supporting documents (all in `medcode-api/docs/`)

| File | What it is |
|---|---|
| `api-contract.md` | Full contract — endpoints, shapes, errors, auth (source of truth) |
| `types.ts` | TypeScript mirror of every response shape, for exact typing |
| `MedCode-AI-iMed-Integration-API-Contract-v1.pdf` | The contract MedCode AI wrote and sent *to* the hospital for the R1–R6 read side |
| `imed-integration.md` | Integration design + 17 open questions still owed to the hospital |
| `imed-writeback-as-built.md` | Real request/response bodies, byte-for-byte, with "as-built vs. spec" discrepancies called out |
