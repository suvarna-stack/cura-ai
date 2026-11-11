-- Export coder-approved cases for the AI service (accuracy plan, step 3).
--
-- One JSON object per line: the chart sections and the approved codes,
-- principal diagnosis first. No patient number, name or case date is
-- exported; the case id is kept only so a case can be left out of its own
-- test (eval_suggest.py --memory loo).
--
-- The output is still patient chart text. Run it ON the hospital server and
-- write the file next to the AI service there; do not copy it off-site.
-- ai/.gitignore already keeps ai/data/cases/ out of git.
--
--   psql "$MEDCODE_DB_URL" -At -f backend/scripts/export_approved_cases.sql \
--       > ai/data/cases/approved_cases.jsonl
--
-- Then restart the AI service (the case memory loads once at start), and
-- score the pipeline on the real cases:
--
--   cd ai && python -m scripts.eval_suggest \
--       --gold data/cases/approved_cases.jsonl --memory loo

SELECT json_build_object(
    'id', c.case_id,
    'department', c.department,
    'sections', COALESCE((
        SELECT json_object_agg(f.fieldname, f.val)
        FROM (
            SELECT s.fieldname,
                   string_agg(s.value, E'\n' ORDER BY s.recorddatetime, s.section_id) AS val
            FROM case_report_sections s
            WHERE s.case_id = c.case_id
              AND s.fieldname IS NOT NULL
              AND COALESCE(s.value, '') <> ''
            GROUP BY s.fieldname
        ) f
    ), '{}'::json),
    'icd10', COALESCE((
        SELECT json_agg(i.code ORDER BY
                   CASE cc.code_role WHEN 'principal_diagnosis' THEN 0
                                     WHEN 'secondary_diagnosis' THEN 1
                                     ELSE 2 END,
                   cc.case_code_id)
        FROM case_codes cc
        JOIN icd_10 i ON i.icd_10_id = cc.icd_10_id
        WHERE cc.case_id = c.case_id
    ), '[]'::json),
    'icd9', COALESCE((
        SELECT json_agg(i.code ORDER BY cc.case_code_id)
        FROM case_codes cc
        JOIN icd_9 i ON i.icd_9_id = cc.icd_9_id
        WHERE cc.case_id = c.case_id
    ), '[]'::json)
)
FROM cases c
WHERE c.case_status = 'approved';
