# Appendix C — Database schema

The schema is defined as Flyway migrations, which double as its own dated
change log — more reliable than a hand-maintained ERD, since it's what
actually ran. Two databases exist: `medcode` (this system's own data) and
`imed` (the mock hospital, standing in for the real iMed system).

## `medcode` database — `medcode-api/src/main/resources/db/migrations/`

| Migration | What it adds |
|---|---|
| `V1__add_password_hash.sql` | Auth support on the frozen seed schema |
| `V2__imed_write_ops.sql` | The hospital write-back revert journal |
| `V3__split_icd_codes.sql` | Splits the single `icd_codes` catalog into `icd_10` + `icd_9` |
| `V4__case_code_operation_times.sql` | Operation time window on `case_codes` |
| `V5__operation_type_and_case_vitals.sql` | Two hospital-UI elements the hospital asked to carry into medcode |
| `V6__case_child_foreign_keys.sql` | Two foreign keys hand-written DDL had lost |
| `V7__agent_chat_history.sql` | AI Agent chat history |
| `V8__case_stars.sql` | Case "starred" flag |
| `V9__app_settings.sql` | App-wide settings table |

## `imed` database (mock hospital) — `imed-mock-api/src/main/resources/db/migrations/`

| Migration | What it adds |
|---|---|
| `V1__api_v1.sql` | DDL the `/api/v1` write surface needs on top of the frozen extract |
| `V2__icd_catalog.sql` | The hospital's ICD reference catalogs (code master tables) |
| `V3__updated_at.sql` | `updated_at`, backing the `changed_since` sync filter |
| `V4__precoded_demo_visits.sql` | Demo data: 5 seed visits that arrive already coded on both systems |
| `V5__coding_status.sql` | `coding_status` on the visit row |
| `V6__icd_catalog_data.sql` | The actual ICD-10 / ICD-9 catalog rows (code master data) |

## Plain-language companion

`medcode-api/docs/medical-glossary.md` (381 lines) explains every
table/column's real-world meaning, sourced and explicit about which fields
are project inventions vs. real hospital data:

1. The job this software supports
2. People (roles)
3. A "case" — one patient visit
4. The codes (ICD-10, ICD-9)
5. The Thai coding rulebook (ICD-10-TM)
6. The chart — note types and sections
7. Orders — what was done and given
8. Who pays — Thai coverage schemes
9. Departments and wards (Thai → English)
10. Shorthand that appears inside note text
11. **Terms that are OUR rules, not medicine** — the honest "we invented this" index
12. Hospital-side (iMed) terms

Section 11 is the one worth reading first if checking what in this schema
is a genuine hospital/clinical fact versus a project design decision.
