-- V4 — demo data: five seed visits that arrive already coded on both systems.
--
-- Context: demo data. Five OPD seed visits arrive from the "hospital"
-- already coded on BOTH systems — each already carries a seed ICD-9
-- procedure, and these rows add the matching ICD-10 primary diagnosis,
-- taken from the visit's own Assessment note text. MedCode AI's
-- completeness rule ("arrived already coded with both ICD-10 and ICD-9")
-- then shows them as complete after a sync. The sixth ICD-9-only seed
-- visit (87026072915054701201, tension headache / CT brain) is left
-- uncoded on purpose so the "missing ICD-10 only" state stays visible.
--
-- Idempotence: WHERE NOT EXISTS keyed on the row id — the extract table
-- has no primary key. Mirrored into imed_baseline (guarded, because INSERT
-- has no IF EXISTS) so /api/demo/reset keeps the rows. L02.4 is the one
-- code the seed catalog lacks.

INSERT INTO imed.icd_10 (code, description)
VALUES ('L02.4', 'Abscess, hip')
ON CONFLICT (code) DO NOTHING;

WITH new_dx (transactionnumber, id, name, icd) AS (
    VALUES
        ('87026072209142300201', '87026072209142020101', 'Hemorrhoid Grade 3',  'K64.2'),
        ('87026072310024100701', '87026072310024020101', 'Dermoid Cyst, Ovary', 'D27'),
        ('87026072414445200401', '87026072414445020101', 'Low back pain',       'M54.5'),
        ('87026072711124400801', '87026072711124020101', 'Abscess, Rt hip',     'L02.4'),
        ('87026072813401900901', '87026072813401020101', 'Lipoma at back',      'D17.1')
)
INSERT INTO imed.medhack_diagnosis_icd10
    (transactionnumber, encountertype, id, name, icd, diagnosistype, is_cancelled, updated_at)
SELECT n.transactionnumber, '0', n.id, n.name, n.icd, 'PRIMARY_DIAGNOSIS', NULL, NULL
FROM new_dx n
WHERE NOT EXISTS (SELECT 1 FROM imed.medhack_diagnosis_icd10 d WHERE d.id = n.id);

DO $$
BEGIN
    -- WHERE NOT EXISTS, not ON CONFLICT: the baseline snapshot tables
    -- carry no PK (CREATE TABLE ... AS drops constraints)
    IF to_regclass('imed_baseline.icd_10') IS NOT NULL THEN
        INSERT INTO imed_baseline.icd_10 (code, description)
        SELECT 'L02.4', 'Abscess, hip'
        WHERE NOT EXISTS (SELECT 1 FROM imed_baseline.icd_10 WHERE code = 'L02.4');
    END IF;

    IF to_regclass('imed_baseline.medhack_diagnosis_icd10') IS NOT NULL THEN
        INSERT INTO imed_baseline.medhack_diagnosis_icd10
            (transactionnumber, encountertype, id, name, icd, diagnosistype, is_cancelled, updated_at)
        SELECT n.transactionnumber, '0', n.id, n.name, n.icd, 'PRIMARY_DIAGNOSIS', NULL, NULL
        FROM (VALUES
            ('87026072209142300201', '87026072209142020101', 'Hemorrhoid Grade 3',  'K64.2'),
            ('87026072310024100701', '87026072310024020101', 'Dermoid Cyst, Ovary', 'D27'),
            ('87026072414445200401', '87026072414445020101', 'Low back pain',       'M54.5'),
            ('87026072711124400801', '87026072711124020101', 'Abscess, Rt hip',     'L02.4'),
            ('87026072813401900901', '87026072813401020101', 'Lipoma at back',      'D17.1')
        ) AS n (transactionnumber, id, name, icd)
        WHERE NOT EXISTS (SELECT 1 FROM imed_baseline.medhack_diagnosis_icd10 d WHERE d.id = n.id);
    END IF;
END $$;
