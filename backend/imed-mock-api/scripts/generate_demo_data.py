#!/usr/bin/env python3
"""
Grow the mock hospital's demo dataset to ~100 OPD visits, plus a handful of IPD
admissions, and backfill the columns the original extract left empty.

WHY THIS EXISTS
---------------
The seed dump shipped 21 hand-written visits. That is enough to prove the demo
loop but too thin to show a dashboard under load, to exercise paging (the R1-R6
read contract refuses >20 visit ids and >31-day windows, so medcode-api has to
chunk), or to show the three coding states side by side.

This script is the ONE source of that bulk data. It is deterministic (fixed RNG
seed), so re-running it reproduces byte-identical rows, and it is idempotent: it
deletes everything it previously generated before rebuilding. The 21 original
visits are never touched except for the null-backfill pass -- their Thai
clinical notes are hand-written and four of their ids are asserted on by name in
medcode-api's and imed-mock-api's test suites.

WHAT IT DELIBERATELY DOES *NOT* FILL
------------------------------------
Seven medhack_patient/bedmanagement columns stay NULL on every OPD visit:
admissionnumber, admissiondatetime, dischargedatetime, dischargetype,
dischargestatus, ward, bednumber. That is not an oversight -- an outpatient is
never admitted, so there is no admission or bed. More concretely, medcode-api
derives encountertype from admissionnumber (SyncRules.encounterType) and its
dashboard query is `WHERE encountertype='0'` (CasesRepository:137), so filling
admissionnumber on an OPD visit would silently REMOVE it from the dashboard.
The IPD visits at the end of this file are what populate those columns.

Likewise untouched: coding_status is set only for the "finished" bucket (it is
the hospital-side approval marker medcode-api writes on approve), and
is_cancelled/updated_at on the two code tables stay NULL until a write-back
touches the row.

DOMAIN SOURCES
--------------
Every clinical vocabulary here is copied from a source, not invented:

  * docs/medical-glossary.md (medcode-api) -- section 5 carries the ICD-10-TM
    Volume 5 Standard Coding Guidelines our coders are judged against, section 6
    the defined document types, section 9 the observed department and ward
    names. Two Volume 5 rules bind this file directly: exactly ONE principal
    diagnosis per visit, and routine work (dressing a wound, giving an
    injection, IV fluids, urinary catheterisation) is NOT coded -- which is why
    57.94 and 99.29 do not appear here even though both exist in the catalog.
  * docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf -- the read contract
    sent to the hospital. It is the authority for field semantics; note in
    particular "ward: Current ward; null for OPD", which is why OPD visits here
    carry no ward.
  * The 21 original visits already in the extract -- for id layout, drug label
    format (drug, strength, form) and department strings.

ICD codes are checked against imed.icd_10 / imed.icd_9 before use. Lab values
are keyed to the principal diagnosis (see `abn` on each scenario) so the numbers
support the doctor's assessment; a pneumonia chart with a normal white count is
worse than no labs at all, because the coder and the AI both read the panel as
evidence.

USAGE
-----
    python3 scripts/generate_demo_data.py            # against $IMED_DB or "imed"
    IMED_DB=imed python3 scripts/generate_demo_data.py

Run it against a database that is otherwise at demo start, then regenerate the
dump with scripts/dump_seed.sh.
"""

import datetime as dt
import os
import random
import subprocess
import sys

DB = os.environ.get("IMED_DB", "imed")
RNG = random.Random(20260821)

# The 21 hand-written visits. Never deleted, never re-generated -- only their
# empty columns are backfilled. Four of these ids are hardcoded in test suites.
ORIGINAL = [
    "87026072209142300201", "87026072310024100701", "87026072413210500101",
    "87026072414445200401", "87026072508311700301", "87026072711124400801",
    "87026072716380901001", "87026072808552901401", "87026072810245101501",
    "87026072813401900901", "87026072909410201601", "87026072913173601701",
    "87026072915054701201", "87026073008122001901", "87026073010193301301",
    "87026073014031102001", "87026073015264002101", "87026073109520800501",
    "87026073111085600601", "87026073115294701801", "87026080110481501101",
]

# The code rows the 21 originals genuinely arrived with -- five ICD-10
# diagnoses (added by V4__precoded_demo_visits.sql) and six ICD-9 procedures
# from the extract itself. Anything else on an original visit is a write-back
# from a past demo or test run and gets cleared.
SEED_DX = ", ".join("'" + i + "'" for i in (
    "87026072310024020101", "87026072414445020101", "87026072209142020101",
    "87026072711124020101", "87026072813401020101"))
SEED_PX = ", ".join("'" + i + "'" for i in (
    "87026072209142012401", "87026072414445010501", "87026072310024010301",
    "87026072711124010401", "87026072915054010301", "87026072813401010301"))

DEPT = {
    "MED":   "แผนก OPD MED (อายุรกรรม)",
    "SURG":  "แผนก OPD SURGICAL (ศัลยศาสตร์)",
    "ORTHO": "แผนก OPD ORTHOPEDIC (โรคกระดูกและข้อ)",
    "ENT":   "แผนก OPD E.N.T (หู คอ จมูก)",
    "GP":    "แผนก OPD GP (ทั่วไป ชั้น1)",
    "ER":    "แผนก ER (อุบัติเหตุและฉุกเฉิน)",
}
# Inpatient department + ward. Both come from the vocabulary
# docs/medical-glossary.md §9 records as actually observed in this hospital's
# extract -- the ward names verbatim, the department following the attested
# "IPD Ward NN (specialty)" pattern (the glossary's own example is
# "IPD Ward 11B (เคมีบำบัด)"). Do not invent new ones here: `ward` is served
# straight through R1-R6 and shown to coders.
IPD_DEPT = {
    "MED":   ("IPD Ward 5A (อายุรกรรม)", "อายุรกรรมทั่วไป"),
    "ORTHO": ("IPD Ward 7B (ศัลยกรรมกระดูก)", "ศัลยกรรมกระดูก"),
    "ENT":   ("IPD Ward 6A (โสต ศอ นาสิก)", "โสต ศอ นาสิก"),
}

# Coverage codes as they appear in the extract. Weighted so the mix looks like a
# Thai district hospital: mostly UCS/WEL (NHSO), some civil-servant OFC, a few
# self-pay. medcode-api derives the scheme family from the prefix.
COVERAGE = (
    ["UCS_89"] * 9 + ["UCS_88"] * 4 + ["WEL_71"] * 4 + ["WEL_73"] * 3
    + ["WEL_74_I"] * 2 + ["WEL_77"] * 3 + ["OFC_O1"] * 3 + ["OFC_O3"] * 3
    + ["OFC_O4"] * 2 + ["OFC_E1"] * 2 + ["OFC_B3"] * 2 + ["LGO_L1"] * 2
    + ["Cashonly"] * 3
)

ALLERGY = [
    "ไม่มีประวัติแพ้ยาแพ้อาหาร",
    "แพ้ยา Penicillin (ผื่นลมพิษ)",
    "แพ้ยา NSAIDs (แน่นหน้าอก หายใจไม่สะดวก)",
    "แพ้อาหารทะเล (ผื่นคัน)",
    "ปฏิเสธประวัติการแพ้ยาและอาหาร",
    "แพ้ยา Sulfa (ผื่นแดงทั้งตัว)",
]
COMORBIDITIES = [
    ("I10", "Essential HT"),
    ("E11.9", "DM Type 2 (Diabetes mellitus Type 2)"),
    ("E78.5", "Hyperlipidemia"),
    ("J45.9", "Bronchial hyperresponsiveness (TM)"),
    ("D50.9", "Iron deficiency anaemia"),
]

PROGRESSION = [
    "อาการทั่วไปดีขึ้น ไข้ลดลง รับประทานอาหารได้ ไม่มีภาวะแทรกซ้อน",
    "แผลผ่าตัดแห้งดี ไม่มีเลือดซึม ปวดแผลลดลง เดินได้เอง",
    "สัญญาณชีพคงที่ ปัสสาวะออกดี ปรับยาตามผลตรวจเลือด",
    "ตอบสนองต่อการรักษาดี พิจารณาจำหน่ายกลับบ้านได้",
    "ไข้ลดลง ผลเพาะเชื้อไม่พบเชื้อ ให้ยาปฏิชีวนะต่อจนครบ",
]
LAB_COMMENTS = [
    "ผลตรวจอยู่ในเกณฑ์ปกติ",
    "ผลตรวจผิดปกติเล็กน้อย แนะนำติดตามซ้ำ",
    "รายงานผลโดยเจ้าหน้าที่ห้องปฏิบัติการ ตรวจสอบแล้ว",
    "ตัวอย่างเลือดมีภาวะ hemolysis เล็กน้อย ไม่กระทบผลการตรวจ",
    "ผลตรวจสอดคล้องกับอาการทางคลินิก",
    "แนะนำตรวจซ้ำเพื่อยืนยันผล",
]
FAMILY_HX = [
    "ปฏิเสธประวัติการเจ็บป่วยของบุคคลในครอบครัว",
    "บิดาเป็นเบาหวาน มารดาเป็นความดันโลหิตสูง",
    "มารดาเป็นความดันโลหิตสูง",
    "พี่ชายเป็นโรคหอบหืด",
    "ปฏิเสธโรคประจำตัวในครอบครัว",
    "บิดาเสียชีวิตด้วยโรคหลอดเลือดสมอง",
]

# --------------------------------------------------------------- lab panels
# (panelname, tmlt, cgd, [(itemname, uom, lo, hi, decimals)])
# Every item carries a real unit. Panels also get the two structural rows iMed
# always emits -- "Comment" and "Attach File" -- which legitimately hold no
# value and no unit; that is how the original extract looks and we keep it.
PANELS = {
    "CBC": ("300034", "30101", [
        ("Hb", "g/dL", 9.5, 16.5, 1), ("Hct", "%", 30.0, 49.0, 1),
        ("White Cell Count", "cells/cu.mm.", 4000, 17000, 0),
        ("Platelets Count", "cells/cu.mm.", 150000, 420000, 0),
        ("Neutrophil", "%", 40, 88, 0), ("Lymphocyte", "%", 8, 45, 0),
    ]),
    "Creatinine": ("300112", "30201", [
        ("BUN", "mg/dL", 6.0, 26.0, 1), ("Creatinine", "mg/dL", 0.5, 1.9, 2),
        ("eGFR", "mL/min/1.73m2", 42, 118, 0),
    ]),
    "Electrolyte": ("300118", "30202", [
        ("Sodium", "mmol/L", 132, 146, 0), ("Potassium", "mmol/L", 3.2, 5.2, 1),
        ("Chloride", "mmol/L", 96, 110, 0), ("Bicarbonate", "mmol/L", 19, 29, 0),
    ]),
    "Glucose (Fasting)": ("300021", "30203", [
        ("Fasting Blood Sugar", "mg/dL", 78, 224, 0),
    ]),
    "Hb A1C": ("300045", "30204", [("Hb A1C", "%", 5.2, 11.4, 1)]),
    "Lipid profile": ("300067", "30205", [
        ("Cholesterol", "mg/dL", 142, 288, 0), ("Triglyceride", "mg/dL", 78, 340, 0),
        ("HDL-Cholesterol", "mg/dL", 30, 74, 0), ("LDL-Cholesterol", "mg/dL", 72, 198, 0),
    ]),
    "Liver Function Test": ("300078", "30206", [
        ("AST", "U/L", 14, 96, 0), ("ALT", "U/L", 11, 104, 0),
        ("Alkaline Phosphatase", "U/L", 42, 148, 0),
        ("Total Bilirubin", "mg/dL", 0.2, 1.9, 2), ("Albumin", "g/dL", 3.1, 5.0, 1),
    ]),
    "Urine Analysis": ("300090", "30207", [
        ("Urine WBC", "/HPF", 0, 42, 0), ("Urine RBC", "/HPF", 0, 18, 0),
        ("Urine Epithelium", "/HPF", 0, 9, 0),
    ]),
}

# ------------------------------------------------------------------- drugs
# (name, itemid, tmt, english signature, thai instruction, qty)
DRUGS = {
    "amox":   ("AMOXICILLIN + CLAVULANATE 1 G TAB [AUGMENTIN]", "DRG0135", "421205",
               "oral 1 tab twice daily pc", "ครั้งละ 1 เม็ด เช้า-เย็น หลังอาหาร", "14"),
    "para":   ("PARACETAMOL 500 MG TAB", "DRG0137", "410421",
               "oral 1 tab every 6 hours prn fever", "ครั้งละ 1 เม็ด ทุก 6 ชั่วโมง เวลามีไข้", "20"),
    "brom":   ("BROMHEXINE 8 MG TAB", "DRG0136", "413360",
               "oral 1 tab three times daily pc", "ครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร", "30"),
    "omep":   ("OMEPRAZOLE 20 MG CAP", "DRG0141", "418822",
               "oral 1 cap once daily ac", "ครั้งละ 1 แคปซูล วันละ 1 ครั้ง ก่อนอาหารเช้า", "30"),
    "simeth": ("SIMETHICONE 80 MG TAB", "DRG0142", "419015",
               "oral 1 tab three times daily pc", "ครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร", "30"),
    "cpm":    ("CHLORPHENIRAMINE 4 MG TAB", "DRG0143", "410902",
               "oral 1 tab three times daily pc", "ครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร", "20"),
    "ibu":    ("IBUPROFEN 400 MG TAB", "DRG0144", "412208",
               "oral 1 tab three times daily pc", "ครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร", "20"),
    "metf":   ("METFORMIN 500 MG TAB", "DRG0145", "416630",
               "oral 1 tab twice daily pc", "ครั้งละ 1 เม็ด เช้า-เย็น หลังอาหาร", "60"),
    "enal":   ("ENALAPRIL 5 MG TAB", "DRG0146", "411455",
               "oral 1 tab once daily", "ครั้งละ 1 เม็ด วันละ 1 ครั้ง เช้า", "30"),
    "simva":  ("SIMVASTATIN 20 MG TAB", "DRG0147", "419120",
               "oral 1 tab once daily hs", "ครั้งละ 1 เม็ด วันละ 1 ครั้ง ก่อนนอน", "30"),
    "salb":   ("SALBUTAMOL 2 MG TAB", "DRG0148", "418950",
               "oral 1 tab three times daily prn", "ครั้งละ 1 เม็ด วันละ 3 ครั้ง เวลาหอบ", "20"),
    "norflox":("NORFLOXACIN 400 MG TAB", "DRG0149", "417720",
               "oral 1 tab twice daily pc", "ครั้งละ 1 เม็ด เช้า-เย็น หลังอาหาร", "10"),
    "orsal":  ("ORS POWDER SACHET", "DRG0150", "417901",
               "oral 1 sachet in 250 mL water prn", "ละลายน้ำ 250 มล. จิบบ่อยๆ เวลาถ่ายเหลว", "10"),
    "tramad": ("TRAMADOL 50 MG CAP", "DRG0151", "419602",
               "oral 1 cap every 8 hours prn pain", "ครั้งละ 1 แคปซูล ทุก 8 ชั่วโมง เวลาปวด", "20"),
    "daflon": ("DAFLON 500 MG TAB", "DRG0121", "411020",
               "oral 2 tab three times daily pc", "ครั้งละ 2 เม็ด วันละ 3 ครั้ง หลังอาหาร", "30"),
    "cetiri": ("CETIRIZINE 10 MG TAB", "DRG0152", "410880",
               "oral 1 tab once daily hs", "ครั้งละ 1 เม็ด วันละ 1 ครั้ง ก่อนนอน", "10"),
    "clotri": ("CLOTRIMAZOLE 1% CREAM 15 G", "DRG0153", "411105",
               "apply to affected area twice daily", "ทาบริเวณที่เป็น เช้า-เย็น", "1"),
    "predni": ("PREDNISOLONE 5 MG TAB", "DRG0154", "418440",
               "oral 2 tab once daily pc", "ครั้งละ 2 เม็ด วันละ 1 ครั้ง หลังอาหารเช้า", "15"),
    "dicloG": ("DICLOFENAC GEL 1% 30 G", "DRG0155", "411320",
               "apply to affected area three times daily", "ทาบริเวณที่ปวด วันละ 3 ครั้ง", "1"),
    "amoxi":  ("AMOXICILLIN 500 MG CAP", "DRG0156", "410610",
               "oral 1 cap three times daily pc", "ครั้งละ 1 แคปซูล วันละ 3 ครั้ง หลังอาหาร", "21"),
}

# --------------------------------------------------------------- scenarios
# Each scenario is one realistic OPD presentation. icd9 is None when the visit
# genuinely has no procedure -- those are the cases that can only ever be
# "incomplete", which is exactly the coding backlog this product exists to work.
S = [
    dict(dept="MED", icd10=("J00", "Common cold"), icd9=None,
         cc="ไข้ต่ำๆ น้ำมูกไหล เจ็บคอ 3 วัน",
         pi="3 วันก่อนมา มีน้ำมูกใส จาม เจ็บคอเล็กน้อย ไอแห้งๆ ไม่มีเหนื่อย รับประทานยาลดไข้อาการดีขึ้นชั่วคราว",
         pe=["General Appearance: good consciousness, not distressed",
             "HEENT: injected pharynx, no exudate, clear nasal discharge",
             "Respiratory: clear breath sound both lungs",
             "Cardiovascular: normal s1s2, no murmur"],
         assess="Common cold\\r\\nPlan: symptomatic treatment, rest, follow up if fever persists",
         plan="Symptomatic treatment, F/U prn", labs=[], drugs=["para", "cpm", "brom"]),
    dict(dept="MED", icd10=("J02.9", "Acute pharyngitis"), icd9=None,
         cc="เจ็บคอมาก กลืนลำบาก 2 วัน",
         pi="2 วันก่อนมา เจ็บคอมากขึ้น กลืนเจ็บ มีไข้ 38.5 องศา ไม่มีไอ ไม่มีน้ำมูก",
         pe=["General Appearance: mild febrile, good consciousness",
             "HEENT: erythematous pharynx with exudate, tonsil not enlarged",
             "Neck: mild tender cervical lymph node",
             "Respiratory: clear breath sound both lungs"],
         assess="Acute pharyngitis\\r\\nPlan: antibiotic 7 days, analgesic",
         plan="Amoxicillin 7 days, F/U if not improved", labs=["CBC"], drugs=["amoxi", "para"]),
    dict(dept="MED", icd10=("J20.9", "Acute bronchitis"), icd9=("93.94", "Therapy [nebulizer]", "NON OR Procedure"),
         cc="ไอมีเสมหะ 5 วัน เหนื่อยเวลาไอ",
         pi="5 วันก่อนมา ไอมีเสมหะสีขาวขุ่น ไข้ต่ำๆ เหนื่อยเล็กน้อยเวลาไอมาก ไม่มีเจ็บหน้าอก",
         pe=["General Appearance: good consciousness, mild tachypnea",
             "Respiratory: coarse crepitation both lower lungs, no wheezing",
             "Cardiovascular: normal s1s2, no murmur",
             "Extremities: no edema"],
         assess="Acute bronchitis\\r\\nPlan: nebulization at OPD, mucolytic, follow up 1 week",
         plan="Nebulizer at OPD, mucolytic, F/U 1 wk", labs=["CBC"], drugs=["brom", "salb", "para"]),
    dict(dept="MED", icd10=("J18.9", "Pneumonia"), icd9=("87.44", "Routine chest x-ray", "NON OR Procedure"),
         cc="ไข้สูง ไอมีเสมหะเขียว เหนื่อย 4 วัน",
         pi="4 วันก่อนมา ไข้สูงหนาวสั่น ไอมีเสมหะสีเขียว เหนื่อยหอบมากขึ้น เบื่ออาหาร อ่อนเพลีย",
         pe=["General Appearance: febrile, looks ill, tachypnea RR 26/min",
             "Respiratory: crepitation at right lower lung, decreased breath sound",
             "Cardiovascular: tachycardia, regular rhythm",
             "HEENT: dry lips, not pale conjunctiva"],
         assess="Community acquired pneumonia, right lower lobe\\r\\nPlan: CXR, antibiotic, close follow up",
         plan="CXR, oral antibiotic, F/U 3 days", labs=["CBC", "Creatinine"], abn={"White Cell Count": (13500, 19800), "Neutrophil": (78, 91), "Lymphocyte": (8, 16)},
         drugs=["amox", "para", "brom"]),
    dict(dept="MED", icd10=("E11.9", "DM Type 2 (Diabetes mellitus Type 2)"), icd9=None,
         cc="มาตรวจตามนัด ติดตามระดับน้ำตาล",
         pi="เป็นเบาหวานมา 6 ปี รับประทานยาสม่ำเสมอ ไม่มีอาการชาปลายมือปลายเท้า ไม่มีแผลที่เท้า",
         pe=["General Appearance: good consciousness, well nourished",
             "Extremities: no foot ulcer, intact pinprick sensation",
             "Cardiovascular: normal s1s2, no murmur",
             "Abdomen: soft, not tender"],
         assess="Type 2 DM, fair control\\r\\nPlan: continue metformin, diet control, F/U 3 months",
         plan="Continue metformin, F/U 3 mo", labs=["Glucose (Fasting)", "Hb A1C", "Creatinine"], abn={"Fasting Blood Sugar": (142, 268), "Hb A1C": (7.4, 10.9)},
         drugs=["metf"]),
    dict(dept="MED", icd10=("I10", "Essential HT"), icd9=("89.52", "EKG -- see also Electrocardiogram", "NON OR Procedure"),
         cc="มาตรวจตามนัด ปวดศีรษะท้ายทอยบางครั้ง",
         pi="เป็นความดันโลหิตสูงมา 4 ปี รับประทานยาสม่ำเสมอ บางครั้งปวดศีรษะท้ายทอยตอนเช้า ไม่มีเจ็บหน้าอก ไม่มีใจสั่น",
         pe=["General Appearance: good consciousness, no distress",
             "Cardiovascular: normal s1s2, no murmur, regular rhythm",
             "Respiratory: clear breath sound both lungs",
             "Extremities: no pitting edema"],
         assess="Essential hypertension, suboptimal control\\r\\nPlan: EKG, adjust dose, salt restriction",
         plan="EKG, adjust antihypertensive, F/U 1 mo", labs=["Creatinine", "Electrolyte", "Lipid profile"], abn={"Creatinine": (1.1, 1.8), "eGFR": (44, 72)},
         drugs=["enal", "simva"]),
    dict(dept="MED", icd10=("E78.5", "Hyperlipidemia"), icd9=None,
         cc="มาตรวจตามนัด ติดตามระดับไขมัน",
         pi="ตรวจพบไขมันในเลือดสูงเมื่อ 1 ปีก่อน รับประทานยาลดไขมันสม่ำเสมอ ไม่มีอาการปวดกล้ามเนื้อ",
         pe=["General Appearance: good consciousness, overweight build",
             "Cardiovascular: normal s1s2, no murmur",
             "Abdomen: soft, no organomegaly",
             "Extremities: no xanthoma"],
         assess="Dyslipidemia on statin\\r\\nPlan: continue statin, lifestyle modification",
         plan="Continue simvastatin, F/U 3 mo", labs=["Lipid profile", "Liver Function Test"], abn={"Cholesterol": (238, 312), "Triglyceride": (196, 388), "LDL-Cholesterol": (158, 214), "HDL-Cholesterol": (28, 42)},
         drugs=["simva"]),
    dict(dept="MED", icd10=("K29.1", "Acute gastritis"), icd9=None,
         cc="ปวดแสบท้องใต้ลิ้นปี่ 3 วัน",
         pi="3 วันก่อนมา ปวดแสบบริเวณลิ้นปี่ เป็นมากตอนท้องว่าง มีคลื่นไส้ ไม่มีอาเจียนเป็นเลือด ไม่มีถ่ายดำ",
         pe=["General Appearance: good consciousness, not pale",
             "Abdomen: soft, mild epigastric tenderness, no guarding, active bowel sound",
             "HEENT: not pale conjunctiva, anicteric sclera",
             "Extremities: no edema"],
         assess="Acute gastritis\\r\\nPlan: PPI 4 weeks, avoid NSAIDs and spicy food",
         plan="Omeprazole 4 wk, diet advice", labs=["CBC"], drugs=["omep", "simeth"]),
    dict(dept="MED", icd10=("K21.9", "GERD"), icd9=None,
         cc="แสบร้อนกลางอก เรอเปรี้ยว 2 สัปดาห์",
         pi="2 สัปดาห์ก่อนมา แสบร้อนกลางอกหลังอาหาร เรอเปรี้ยว เป็นมากเวลานอนราบ ไม่มีกลืนลำบาก น้ำหนักไม่ลด",
         pe=["General Appearance: good consciousness, well nourished",
             "Abdomen: soft, mild epigastric tenderness",
             "Cardiovascular: normal s1s2, no murmur",
             "Respiratory: clear breath sound both lungs"],
         assess="Gastroesophageal reflux disease\\r\\nPlan: PPI, elevate head of bed, avoid late meal",
         plan="PPI 8 wk, lifestyle advice", labs=[], drugs=["omep", "simeth"]),
    dict(dept="MED", icd10=("A09.9", "Acute gastroenteritis"), icd9=None,
         cc="ถ่ายเหลว 6 ครั้ง อาเจียน 1 วัน",
         pi="1 วันก่อนมา ถ่ายเหลวเป็นน้ำ 6 ครั้ง ไม่มีมูกเลือด อาเจียน 3 ครั้ง ปวดบิดท้อง หลังรับประทานอาหารนอกบ้าน",
         pe=["General Appearance: mild dehydration, good consciousness",
             "Abdomen: soft, diffuse mild tenderness, hyperactive bowel sound",
             "HEENT: dry lips, sunken eye not remarkable",
             "Extremities: warm, capillary refill < 2 sec"],
         assess="Acute gastroenteritis with mild dehydration\\r\\nPlan: ORS, observe, follow up if worse",
         plan="ORS, diet advice, F/U prn", labs=["CBC", "Electrolyte"], abn={"Sodium": (128, 136), "Potassium": (3.0, 3.6), "Bicarbonate": (16, 21)},
         drugs=["orsal", "simeth", "para"]),
    dict(dept="MED", icd10=("D50.9", "Iron deficiency anaemia"), icd9=None,
         cc="อ่อนเพลีย เหนื่อยง่าย 1 เดือน",
         pi="1 เดือนก่อนมา อ่อนเพลีย เหนื่อยง่ายเวลาออกแรง หน้ามืดเวลาลุกยืน ประจำเดือนมามากกว่าปกติ",
         pe=["General Appearance: pale looking, good consciousness",
             "HEENT: pale conjunctiva, anicteric sclera",
             "Cardiovascular: systolic ejection murmur grade 2/6",
             "Abdomen: soft, no hepatosplenomegaly"],
         assess="Iron deficiency anemia\\r\\nPlan: iron supplement, investigate cause",
         plan="Iron supplement, F/U 1 mo", labs=["CBC", "Creatinine"], abn={"Hb": (6.8, 9.4), "Hct": (22.0, 30.5)},
         drugs=["para"]),
    dict(dept="MED", icd10=("N39.0", "Urinary tract infection"), icd9=None,
         cc="ปัสสาวะแสบขัด 3 วัน",
         pi="3 วันก่อนมา ปัสสาวะแสบขัด ปัสสาวะบ่อย กะปริดกะปรอย ไม่มีไข้ ไม่มีปวดหลัง",
         pe=["General Appearance: good consciousness, afebrile",
             "Abdomen: soft, mild suprapubic tenderness",
             "Back: no CVA tenderness both sides",
             "Extremities: no edema"],
         assess="Uncomplicated urinary tract infection\\r\\nPlan: antibiotic 5 days, increase water intake",
         plan="Norfloxacin 5 days, F/U prn", labs=["Urine Analysis", "CBC"], abn={"Urine WBC": (28, 95), "Urine RBC": (4, 22), "White Cell Count": (9500, 14500)},
         drugs=["norflox", "para"]),
    dict(dept="MED", icd10=("J45.9", "Bronchial hyperresponsiveness (TM)"), icd9=("93.94", "Therapy [nebulizer]", "NON OR Procedure"),
         cc="หอบเหนื่อย หายใจมีเสียงวี๊ด 2 วัน",
         pi="2 วันก่อนมา หายใจมีเสียงวี๊ด เหนื่อยเวลาออกแรง เป็นมากตอนกลางคืน มีประวัติหอบหืดตั้งแต่เด็ก",
         pe=["General Appearance: mild dyspnea, able to speak in sentence",
             "Respiratory: expiratory wheezing both lungs, prolonged expiration",
             "Cardiovascular: tachycardia, regular rhythm",
             "Extremities: no cyanosis"],
         assess="Asthma with acute exacerbation, mild\\r\\nPlan: nebulization, bronchodilator, follow up",
         plan="Nebulizer, bronchodilator, F/U 1 wk", labs=["CBC"], drugs=["salb", "predni"]),
    dict(dept="SURG", icd10=("K64.2", "Hemorrhoid Grade 3"), icd9=("49.46", "Hemorrhoidectomy", "OR Procedure"),
         cc="ถ่ายเป็นเลือดสด มีก้อนยื่นที่ทวารหนัก 3 สัปดาห์",
         pi="3 สัปดาห์ก่อนมา ถ่ายเป็นเลือดสดหยดหลังอุจจาระ มีก้อนยื่นเวลาเบ่ง ดันกลับได้ ไม่ปวด",
         pe=["General Appearance: good consciousness, not pale",
             "PR: internal hemorrhoid 3,7 o'clock grade III, no mass",
             "Abdomen: soft, not tender, active bowel sound",
             "Extremities: no edema"],
         assess="Internal hemorrhoid grade III\\r\\nPlan: hemorrhoidectomy, high fiber diet",
         plan="Hemorrhoidectomy, F/U 2 wk", labs=["CBC"], drugs=["daflon", "para"]),
    dict(dept="SURG", icd10=("K35.8", "Acute appendicitis"), icd9=("47.09", "Appendectomy", "OR Procedure"),
         cc="ปวดท้องน้อยขวา 1 วัน",
         pi="1 วันก่อนมา ปวดรอบสะดือแล้วย้ายมาปวดท้องน้อยขวา ปวดมากขึ้นเรื่อยๆ มีไข้ต่ำๆ เบื่ออาหาร คลื่นไส้",
         pe=["General Appearance: looks ill, mild febrile",
             "Abdomen: RLQ tenderness with rebound, positive Rovsing sign, guarding",
             "Bowel sound: decreased",
             "Extremities: warm, no edema"],
         assess="Acute appendicitis\\r\\nPlan: appendectomy, NPO, IV antibiotic",
         plan="Appendectomy today", labs=["CBC", "Creatinine", "Electrolyte"], abn={"White Cell Count": (12800, 18500), "Neutrophil": (76, 90), "Lymphocyte": (7, 15)},
         drugs=["amox", "tramad"]),
    dict(dept="SURG", icd10=("L02.4", "Abscess, hip"), icd9=("86.04", "Incision and drainage of abscess", "OR Procedure"),
         cc="ก้อนบวมแดงที่สะโพกขวา ปวดมาก 5 วัน",
         pi="5 วันก่อนมา มีก้อนบวมแดงร้อนที่สะโพกขวา ปวดตุบๆ มากขึ้น มีไข้ต่ำๆ กดเจ็บมาก",
         pe=["General Appearance: mild febrile, good consciousness",
             "Skin: fluctuant erythematous swelling at right hip 4x5 cm, warm and tender",
             "Extremities: limited range of motion of right hip due to pain",
             "Lymph node: no inguinal lymphadenopathy"],
         assess="Abscess at right hip\\r\\nPlan: incision and drainage, antibiotic",
         plan="I&D, antibiotic 7 days, daily dressing", labs=["CBC"], abn={"White Cell Count": (11800, 17200), "Neutrophil": (74, 88)},
         drugs=["amox", "para", "tramad"]),
    dict(dept="SURG", icd10=("D17.1", "lipoma at back"), icd9=("86.11", "Biopsy of skin and subcutaneous tissue", "OR Procedure"),
         cc="ก้อนใต้ผิวหนังที่หลัง โตขึ้นช้าๆ 1 ปี",
         pi="1 ปีก่อนมา คลำได้ก้อนใต้ผิวหนังที่หลัง โตขึ้นช้าๆ ไม่ปวด ไม่แดง กังวลเรื่องความสวยงาม",
         pe=["General Appearance: good consciousness, no distress",
             "Skin: soft mobile subcutaneous mass 3x3 cm at upper back, non tender",
             "Lymph node: no regional lymphadenopathy",
             "Extremities: no edema"],
         assess="Lipoma at back\\r\\nPlan: excision under local anesthesia, send pathology",
         plan="Excision, pathology, F/U 1 wk", labs=["CBC"], drugs=["para", "amoxi"]),
    dict(dept="SURG", icd10=("N20.0", "Renal calculi"), icd9=("88.75", "Diagnostic ultrasound of urinary system", "NON OR Procedure"),
         cc="ปวดบิดเอวขวาร้าวลงขาหนีบ 1 วัน",
         pi="1 วันก่อนมา ปวดบิดเอวขวาเป็นพักๆ ร้าวลงขาหนีบ ปัสสาวะมีเลือดปน คลื่นไส้อาเจียน",
         pe=["General Appearance: restless from pain, afebrile",
             "Back: right CVA tenderness",
             "Abdomen: soft, no rebound tenderness",
             "Extremities: warm, no edema"],
         assess="Right renal calculi with renal colic\\r\\nPlan: analgesic, hydration, urology follow up",
         plan="Analgesic, hydration, urology F/U", labs=["Urine Analysis", "Creatinine", "CBC"], abn={"Urine RBC": (18, 70), "Urine WBC": (6, 24)},
         drugs=["tramad", "ibu"]),
    dict(dept="ORTHO", icd10=("M54.5", "Low back pain"), icd9=("93.35", "Other heat therapy", "NON OR Procedure"),
         cc="ปวดหลังส่วนล่าง 2 สัปดาห์",
         pi="2 สัปดาห์ก่อนมา ปวดหลังส่วนล่างหลังยกของหนัก ปวดมากเวลาก้ม ไม่มีร้าวลงขา ไม่มีชา ไม่มีอ่อนแรง",
         pe=["General Appearance: good consciousness, antalgic gait",
             "Back: paravertebral muscle spasm L4-L5, no midline tenderness",
             "Neurological: motor power grade V both legs, intact sensation",
             "Straight leg raising test: negative both sides"],
         assess="Mechanical low back pain\\r\\nPlan: heat therapy, NSAIDs, back exercise",
         plan="Heat therapy, NSAIDs, exercise advice", labs=[], drugs=["ibu", "dicloG"]),
    dict(dept="ORTHO", icd10=("M17.1", "OA left knee"), icd9=("81.92", "Joint injection", "NON OR Procedure"),
         cc="ปวดเข่าซ้าย เดินลำบาก 6 เดือน",
         pi="6 เดือนก่อนมา ปวดเข่าซ้ายเวลาเดินและขึ้นบันได มีเสียงกรอบแกรบ ตอนเช้าฝืดประมาณ 10 นาที",
         pe=["General Appearance: good consciousness, overweight build",
             "Left knee: crepitus on movement, mild effusion, tender medial joint line",
             "Range of motion: flexion limited to 110 degrees",
             "Extremities: no distal neurovascular deficit"],
         assess="Osteoarthritis left knee, Kellgren-Lawrence grade 3\\r\\nPlan: intra-articular injection, quadriceps exercise",
         plan="Joint injection, exercise, weight control", labs=["CBC"], drugs=["para", "dicloG"]),
    dict(dept="ORTHO", icd10=("M75.1", "Rotator cuff tear of left shoulder (supraspinatus, high-grade partial bursal side tear)"), icd9=None,
         cc="ปวดไหล่ซ้าย ยกแขนไม่ขึ้น 2 เดือน",
         pi="2 เดือนก่อนมา ปวดไหล่ซ้าย ยกแขนเหนือศีรษะไม่ได้ ปวดมากตอนกลางคืน นอนทับไม่ได้",
         pe=["General Appearance: good consciousness, no distress",
             "Left shoulder: tender at greater tuberosity, painful arc 60-120 degrees",
             "Jobe test: positive, weakness of abduction",
             "Neurological: intact sensation of left upper limb"],
         assess="Rotator cuff tear, left shoulder\\r\\nPlan: physiotherapy, NSAIDs, MRI if not improved",
         plan="Physiotherapy, NSAIDs, F/U 1 mo", labs=[], drugs=["ibu", "dicloG"]),
    dict(dept="ENT", icd10=("J03.9", "Acute tonsillitis"), icd9=None,
         cc="เจ็บคอ กลืนลำบาก ไข้สูง 3 วัน",
         pi="3 วันก่อนมา เจ็บคอมาก กลืนลำบาก ไข้สูง 38.8 องศา ไม่มีไอ เสียงไม่แหบ",
         pe=["General Appearance: febrile, good consciousness",
             "HEENT: enlarged tonsil grade 3 both sides with exudate",
             "Neck: tender enlarged cervical lymph node both sides",
             "Respiratory: clear breath sound both lungs"],
         assess="Acute tonsillitis\\r\\nPlan: antibiotic 10 days, analgesic, warm salt gargle",
         plan="Antibiotic 10 days, F/U 1 wk", labs=["CBC"], abn={"White Cell Count": (11500, 16000), "Neutrophil": (72, 86)},
         drugs=["amoxi", "para"]),
    dict(dept="ENT", icd10=("J32.9", "Chronic sinusitis"), icd9=None,
         cc="คัดจมูก น้ำมูกข้น ปวดโหนกแก้ม 2 เดือน",
         pi="2 เดือนก่อนมา คัดจมูกเรื้อรัง น้ำมูกข้นสีเหลือง ปวดตื้อโหนกแก้มทั้งสองข้าง ได้กลิ่นลดลง",
         pe=["General Appearance: good consciousness, afebrile",
             "HEENT: purulent discharge at middle meatus, tender over maxillary sinus",
             "Oral cavity: post nasal drip present",
             "Neck: no lymphadenopathy"],
         assess="Chronic maxillary sinusitis\\r\\nPlan: antibiotic 14 days, nasal irrigation",
         plan="Antibiotic 14 days, nasal saline irrigation", labs=["CBC"], abn={"White Cell Count": (9800, 13500), "Neutrophil": (68, 80)},
         drugs=["amox", "cpm", "para"]),
    dict(dept="ENT", icd10=("H61.2", "Impacted cerumen"), icd9=None,
         cc="หูอื้อข้างขวา 1 สัปดาห์",
         pi="1 สัปดาห์ก่อนมา หูอื้อข้างขวา ได้ยินลดลง ไม่มีปวดหู ไม่มีน้ำหนวก ไม่มีเวียนศีรษะ",
         pe=["General Appearance: good consciousness, no distress",
             "Right ear: impacted cerumen obscuring tympanic membrane",
             "Left ear: intact tympanic membrane, good light reflex",
             "Neck: no lymphadenopathy"],
         assess="Impacted cerumen, right ear\\r\\nPlan: ear irrigation, recheck hearing",
         plan="Ear irrigation at OPD", labs=[], drugs=[]),
    dict(dept="ENT", icd10=("J30.4", "Allergic rhinitis"), icd9=None,
         cc="จาม คันจมูก น้ำมูกใส เป็นๆ หายๆ 3 เดือน",
         pi="3 เดือนก่อนมา จามติดกันตอนเช้า คันจมูก คันตา น้ำมูกใส เป็นมากเวลาโดนฝุ่น",
         pe=["General Appearance: good consciousness, no distress",
             "HEENT: pale boggy nasal mucosa, clear discharge, allergic shiner",
             "Respiratory: clear breath sound both lungs",
             "Skin: no rash"],
         assess="Allergic rhinitis\\r\\nPlan: antihistamine, allergen avoidance",
         plan="Antihistamine, avoid dust, F/U prn", labs=[], drugs=["cetiri", "cpm"]),
    dict(dept="GP", icd10=("R51", "Headache"), icd9=("87.03", "CT Brain Without Contrast", "NON OR Procedure"),
         cc="ปวดศีรษะรุนแรง 3 วัน",
         pi="3 วันก่อนมา ปวดศีรษะตุบๆ ทั่วศีรษะ รุนแรงขึ้นเรื่อยๆ ไม่มีไข้ ไม่มีอาเจียนพุ่ง ไม่มีแขนขาอ่อนแรง",
         pe=["General Appearance: good consciousness, E4V5M6",
             "Neurological: pupil 3 mm RTL both eyes, no focal neurological deficit",
             "Neck: supple, no stiffness",
             "Cardiovascular: normal s1s2, no murmur"],
         assess="Headache, rule out intracranial lesion\\r\\nPlan: CT brain, analgesic",
         plan="CT brain, analgesic, F/U with result", labs=["CBC"], drugs=["para", "ibu"]),
    dict(dept="GP", icd10=("G43.9", "Migraine headache"), icd9=None,
         cc="ปวดศีรษะข้างเดียว เป็นๆ หายๆ 6 เดือน",
         pi="6 เดือนก่อนมา ปวดศีรษะข้างซ้ายตุบๆ เป็นครั้งละ 4-6 ชั่วโมง มีคลื่นไส้ ไม่ชอบแสง เป็นเดือนละ 3-4 ครั้ง",
         pe=["General Appearance: good consciousness, no distress",
             "Neurological: no focal neurological deficit, normal fundi",
             "Neck: supple, no stiffness",
             "HEENT: no sinus tenderness"],
         assess="Migraine without aura\\r\\nPlan: abortive therapy, headache diary, trigger avoidance",
         plan="Analgesic prn, headache diary", labs=[], drugs=["para", "ibu"]),
    dict(dept="GP", icd10=("L23.9", "Allergic contact dermatitis"), icd9=None,
         cc="ผื่นคันที่แขนทั้งสองข้าง 1 สัปดาห์",
         pi="1 สัปดาห์ก่อนมา มีผื่นแดงคันที่แขนทั้งสองข้าง หลังใช้ครีมชนิดใหม่ คันมากตอนกลางคืน",
         pe=["General Appearance: good consciousness, no distress",
             "Skin: erythematous papules with excoriation at both forearms",
             "Lymph node: no regional lymphadenopathy",
             "Extremities: no edema"],
         assess="Allergic contact dermatitis\\r\\nPlan: topical steroid, antihistamine, stop suspected agent",
         plan="Topical steroid, antihistamine, avoid agent", labs=[], drugs=["cetiri", "predni"]),
    dict(dept="GP", icd10=("B35.4", "Tinea corporis"), icd9=None,
         cc="ผื่นวงแหวนคันที่ลำตัว 3 สัปดาห์",
         pi="3 สัปดาห์ก่อนมา มีผื่นวงแหวนขอบนูนแดง คันมาก ขยายวงกว้างขึ้น ที่ลำตัวและต้นขา",
         pe=["General Appearance: good consciousness, no distress",
             "Skin: annular scaly plaque with raised border at trunk and thigh",
             "Lymph node: no regional lymphadenopathy",
             "Extremities: no nail involvement"],
         assess="Tinea corporis\\r\\nPlan: topical antifungal 4 weeks, keep skin dry",
         plan="Topical antifungal 4 wk, hygiene advice", labs=[], drugs=["clotri", "cetiri"]),
    dict(dept="GP", icd10=("Z00.0", "Check up"), icd9=None,
         cc="มาตรวจสุขภาพประจำปี",
         pi="ไม่มีอาการผิดปกติ มาตรวจสุขภาพประจำปีตามสิทธิ ไม่มีโรคประจำตัว ไม่สูบบุหรี่ ดื่มสุราเป็นครั้งคราว",
         pe=["General Appearance: good consciousness, well nourished",
             "Cardiovascular: normal s1s2, no murmur",
             "Respiratory: clear breath sound both lungs",
             "Abdomen: soft, no organomegaly"],
         assess="Annual health check up, no abnormality detected\\r\\nPlan: routine screening, healthy lifestyle advice",
         plan="Annual screening, lifestyle advice", labs=["CBC", "Glucose (Fasting)", "Lipid profile", "Creatinine"], abn={"White Cell Count": (5200, 9400), "Fasting Blood Sugar": (82, 99), "Cholesterol": (152, 196), "Hb": (12.4, 15.6)},
         drugs=[]),
    dict(dept="ER", icd10=("S61.0", "Open wound of finger(s)"), icd9=("86.59", "Closure of skin", "OR Procedure"),
         cc="มีดบาดนิ้วชี้ขวา เลือดออกมาก 1 ชั่วโมง",
         pi="1 ชั่วโมงก่อนมา ถูกมีดบาดนิ้วชี้ขวาขณะทำอาหาร เลือดออกมาก กดห้ามเลือดแล้ว ขยับนิ้วได้",
         pe=["General Appearance: good consciousness, anxious",
             "Right index finger: laceration wound 2 cm at volar aspect, no tendon exposure",
             "Neurological: intact sensation distal to wound",
             "Vascular: capillary refill < 2 sec, good distal pulse"],
         assess="Laceration wound right index finger\\r\\nPlan: wound toilet and suture, tetanus prophylaxis",
         plan="Suture, tetanus toxoid, F/U 5 days", labs=["CBC"], drugs=["amoxi", "para"]),
    dict(dept="ER", icd10=("S01.8", "laceration wound at head"), icd9=("86.59", "Closure of skin", "OR Procedure"),
         cc="ล้มศีรษะกระแทกพื้น มีแผลที่หน้าผาก 2 ชั่วโมง",
         pi="2 ชั่วโมงก่อนมา ลื่นล้มในห้องน้ำ ศีรษะกระแทกพื้น มีแผลที่หน้าผาก ไม่หมดสติ ไม่อาเจียน จำเหตุการณ์ได้",
         pe=["General Appearance: good consciousness, E4V5M6",
             "Head: laceration wound 3 cm at forehead, no depressed skull",
             "Neurological: pupil 3 mm RTL both eyes, no focal deficit",
             "Cardiovascular: normal s1s2, regular rhythm"],
         assess="Laceration wound at forehead, no sign of intracranial injury\\r\\nPlan: wound suture, head injury advice",
         plan="Suture, head injury precaution, F/U 5 days", labs=["CBC"], drugs=["para", "amoxi"]),
    dict(dept="ER", icd10=("L50.9", "Acute urticaria"), icd9=None,
         cc="ผื่นลมพิษทั้งตัว คันมาก 3 ชั่วโมง",
         pi="3 ชั่วโมงก่อนมา มีผื่นนูนแดงคันทั้งตัว หลังรับประทานอาหารทะเล ไม่มีหายใจลำบาก ไม่มีบวมที่หน้า",
         pe=["General Appearance: good consciousness, restless from itching",
             "Skin: generalized erythematous wheals, no angioedema",
             "Respiratory: clear breath sound, no stridor",
             "Cardiovascular: normal s1s2, blood pressure stable"],
         assess="Acute urticaria from food allergy\\r\\nPlan: antihistamine injection, observe 2 hours",
         plan="Antihistamine injection, observe, avoid seafood", labs=[], drugs=["cetiri", "predni"]),
    dict(dept="MED", icd10=("R10.4", "Abdominal pain"), icd9=("88.79", "Ultrasound Endovaginal", "NON OR Procedure"),
         cc="ปวดท้องน้อยเป็นๆ หายๆ 1 เดือน",
         pi="1 เดือนก่อนมา ปวดท้องน้อยเป็นพักๆ ไม่สัมพันธ์กับประจำเดือน ไม่มีตกขาวผิดปกติ ไม่มีไข้",
         pe=["General Appearance: good consciousness, not distressed",
             "Abdomen: soft, mild suprapubic tenderness, no mass palpable",
             "Back: no CVA tenderness both sides",
             "Extremities: no edema"],
         assess="Chronic pelvic pain, rule out gynecologic cause\\r\\nPlan: ultrasound, gynecology referral",
         plan="Ultrasound, gynecology F/U", labs=["CBC", "Urine Analysis"], drugs=["simeth", "para"]),
    # --- showcase presentations (2026-08-25) --------------------------------
    # Ten surgical/procedural visits carry a COMPLETE chart -- notes, labs,
    # imaging, an operating-room procedure and comorbidity -- because a demo
    # needs cases a coder can actually read end to end. Six of them are new
    # here; the other four (D17.1, K35.8, K64.2, L02.4) already existed and
    # gain imaging below. Every ICD-10/ICD-9 pair is checked against
    # imed.icd_10 / imed.icd_9.
    dict(dept="SURG", icd10=("C50.9", "CA Rt breast"),
         icd9=("85.21", "Local excision of lesion of breast", "OR Procedure"),
         cc="คลำได้ก้อนที่เต้านมขวา 2 เดือน",
         pi="2 เดือนก่อนมา คลำได้ก้อนแข็งที่เต้านมขวาด้านบนด้านนอก ขนาดโตขึ้นช้าๆ ไม่เจ็บ ไม่มีน้ำเหลืองหรือเลือดออกจากหัวนม ไม่มีไข้ น้ำหนักลดลงเล็กน้อย",
         pe=["General Appearance: good consciousness, not pale, no jaundice",
             "Breast: firm mass 2.5 cm at right upper outer quadrant, non-tender, no skin retraction",
             "Axilla: no palpable lymph node both sides",
             "Respiratory: clear breath sound both lungs"],
         assess="Breast mass, right upper outer quadrant\\r\\nPlan: excision biopsy, send for pathology",
         plan="Excision biopsy, pathology, F/U 1 wk",
         labs=["CBC", "Liver Function Test", "Electrolyte"],
         drugs=["para", "amox", "tramad"]),
    dict(dept="SURG", icd10=("E04.1", "Nontoxic single thyroid nodule"),
         icd9=("06.2", "Unilateral thyroid lobectomy", "OR Procedure"),
         cc="คลำได้ก้อนที่คอด้านหน้า 6 เดือน",
         pi="6 เดือนก่อนมา คลำได้ก้อนที่คอด้านหน้าข้างขวา โตขึ้นช้าๆ ไม่เจ็บ กลืนอาหารได้ปกติ ไม่มีเสียงแหบ ไม่ใจสั่น ไม่มือสั่น น้ำหนักคงที่",
         pe=["General Appearance: good consciousness, euthyroid appearance",
             "Neck: firm nodule 3 cm at right thyroid lobe, moves with swallowing, no bruit",
             "Lymph node: no cervical lymphadenopathy",
             "Cardiovascular: normal s1s2, regular rhythm, no tachycardia"],
         assess="Solitary thyroid nodule, right lobe, clinically euthyroid\\r\\nPlan: right lobectomy with frozen section",
         plan="Right thyroid lobectomy, F/U pathology 1 wk",
         labs=["CBC", "Liver Function Test", "Electrolyte"],
         drugs=["para", "tramad", "omep"]),
    dict(dept="MED", icd10=("E11.5", "DM type 2 foot with Diabetic ulcer"),
         icd9=("86.22", "Excisional debridement of wound, infection, or burn", "OR Procedure"),
         cc="แผลที่ฝ่าเท้าขวาไม่หาย 3 สัปดาห์",
         pi="3 สัปดาห์ก่อนมา มีแผลที่ฝ่าเท้าขวา เริ่มจากตุ่มพองแล้วแตกเป็นแผล มีหนองไหล กลิ่นเหม็น ชาปลายเท้าทั้งสองข้าง เป็นเบาหวานมา 10 ปี คุมระดับน้ำตาลได้ไม่ดี",
         pe=["General Appearance: good consciousness, mild febrile",
             "Right foot: 3x2 cm ulcer at plantar aspect with necrotic tissue and purulent discharge",
             "Neurological: decreased protective sensation both feet (monofilament test)",
             "Vascular: dorsalis pedis pulse palpable both sides, no gangrene"],
         assess="Infected diabetic foot ulcer, right\\r\\nPlan: excisional debridement, antibiotic, glycemic control",
         plan="Debridement, antibiotic, DM control, F/U 3 days",
         labs=["CBC", "Glucose (Fasting)", "Hb A1C", "Creatinine"],
         abn={"White Cell Count": (12800, 18600), "Neutrophil": (76, 90),
              "Fasting Blood Sugar": (168, 258), "Hb A1C": (8.4, 11.2)},
         drugs=["amox", "para", "metf"]),
    dict(dept="SURG", icd10=("E14.3", "Diabetic cataract"),
         icd9=("13.41", "Phacoemulsification and aspiration of cataract", "OR Procedure"),
         cc="ตาขวามัวลงเรื่อยๆ 6 เดือน",
         pi="6 เดือนก่อนมา ตาขวามัวลงเรื่อยๆ มองแสงจ้าแล้วพร่า อ่านหนังสือลำบาก ไม่มีปวดตา ไม่มีตาแดง ไม่มีเห็นแสงวาบ เป็นเบาหวานมา 12 ปี",
         pe=["General Appearance: good consciousness, cooperative",
             "Right eye: visual acuity 20/200, lens opacity, pupil round and reactive",
             "Left eye: visual acuity 20/40, early lens opacity",
             "Fundus: no active proliferative change seen, media hazy on the right"],
         assess="Diabetic cataract, right eye\\r\\nPlan: phacoemulsification with intraocular lens implantation",
         plan="Phaco + IOL right eye, F/U 1 day",
         labs=["CBC", "Glucose (Fasting)", "Hb A1C"],
         abn={"Fasting Blood Sugar": (140, 212), "Hb A1C": (7.2, 9.6)},
         drugs=["para", "metf", "cetiri"]),
    dict(dept="ORTHO", icd10=("G56.0", "Carpal tunnel syndrome"),
         icd9=("04.43", "Release of carpal tunnel", "OR Procedure"),
         cc="ชาปลายนิ้วมือขวา ตื่นกลางดึก 4 เดือน",
         pi="4 เดือนก่อนมา ชาที่นิ้วหัวแม่มือ นิ้วชี้ และนิ้วกลางข้างขวา เป็นมากตอนกลางคืนจนตื่น สะบัดมือแล้วอาการดีขึ้น หยิบจับของชิ้นเล็กลำบาก ทำงานเย็บผ้ามา 20 ปี",
         pe=["General Appearance: good consciousness, not distressed",
             "Right hand: positive Tinel sign and Phalen test, mild thenar atrophy",
             "Sensory: decreased sensation over median nerve distribution",
             "Motor: thumb abduction power grade 4"],
         assess="Carpal tunnel syndrome, right, failed conservative treatment\\r\\nPlan: open carpal tunnel release",
         plan="Carpal tunnel release, night splint, F/U 2 wks",
         labs=["CBC", "Glucose (Fasting)"],
         drugs=["ibu", "para", "predni"]),
    dict(dept="SURG", icd10=("K80.2", "symptomatic gallstone"),
         icd9=("51.23", "Laparoscopic cholecystectomy", "OR Procedure"),
         cc="ปวดจุกแน่นใต้ชายโครงขวาหลังกินอาหารมัน 1 เดือน",
         pi="1 เดือนก่อนมา ปวดจุกแน่นใต้ชายโครงขวาเป็นๆ หายๆ มักเป็นหลังรับประทานอาหารมัน ปวดร้าวไปสะบักขวา คลื่นไส้ ไม่อาเจียน ไม่มีไข้ ไม่มีตาเหลือง",
         pe=["General Appearance: good consciousness, not jaundiced",
             "Abdomen: tender at right upper quadrant, positive Murphy sign, no guarding",
             "Bowel sound: normal, no mass palpable",
             "HEENT: no scleral icterus, moist lips"],
         assess="Symptomatic cholelithiasis\\r\\nPlan: laparoscopic cholecystectomy",
         plan="Laparoscopic cholecystectomy, NPO, F/U 1 wk",
         labs=["CBC", "Liver Function Test", "Electrolyte"],
         abn={"AST": (38, 88), "ALT": (42, 96)},
         drugs=["omep", "para", "tramad"]),
    # --- two more procedural presentations for the everyday complete mix ----
    dict(dept="SURG", icd10=("N40", "BPH"), icd9=("57.32", "Cystoscope", "NON OR Procedure"),
         cc="ปัสสาวะลำบาก ต้องเบ่ง ปัสสาวะบ่อยตอนกลางคืน 6 เดือน",
         pi="6 เดือนก่อนมา ปัสสาวะลำบาก ต้องเบ่ง สายปัสสาวะไม่พุ่ง ปัสสาวะบ่อยตอนกลางคืน 3-4 ครั้ง รู้สึกปัสสาวะไม่สุด ไม่มีปัสสาวะเป็นเลือด ไม่มีไข้",
         pe=["General Appearance: good consciousness, not distressed",
             "Abdomen: soft, no palpable bladder, no CVA tenderness",
             "Digital rectal examination: smooth enlarged prostate, no nodule",
             "Genitalia: no urethral discharge"],
         assess="Benign prostatic hyperplasia with lower urinary tract symptoms\\r\\nPlan: cystoscopy, alpha blocker",
         plan="Cystoscopy, medication, F/U 1 month",
         labs=["Urine Analysis", "Creatinine"], drugs=["norflox", "para"]),
    dict(dept="MED", icd10=("R42", "Dizziness"),
         icd9=("88.72", "Echo-Transthoracic", "NON OR Procedure"),
         cc="เวียนศีรษะ บ้านหมุน 3 วัน",
         pi="3 วันก่อนมา เวียนศีรษะบ้านหมุนเวลาเปลี่ยนท่า เป็นครั้งละ 1-2 นาที คลื่นไส้ ไม่อาเจียน ไม่มีหูอื้อ ไม่มีแขนขาอ่อนแรง ไม่มีเจ็บหน้าอก ใจสั่นเล็กน้อย",
         pe=["General Appearance: good consciousness, not distressed",
             "Neurological: no focal neurological deficit, gait steady",
             "HEENT: no nystagmus at rest, positive Dix-Hallpike test on the right",
             "Cardiovascular: normal s1s2, regular rhythm, no murmur"],
         assess="Dizziness, benign paroxysmal positional vertigo, rule out cardiac cause\\r\\nPlan: echocardiogram, vestibular exercise",
         plan="Echocardiogram, Epley manoeuvre, F/U 2 wks",
         labs=["CBC", "Electrolyte"], drugs=["cpm", "para"]),
]


# ---------------------------------------------------------------- imaging
# Radiology reports, keyed by principal diagnosis. iMed delivers these as
# medhack_medicalrecord_result rows with documenttype 'Radiology Report' --
# the SAME table the lab results use, told apart by that one column
# (SyncService: "Radiology Report" -> order_category X-ray, anything else
# "other"). Without a row here a case shows "X-ray —" in the report header,
# which is what every generated visit did before 2026-08-25.
#
# Only presentations that genuinely GET imaging appear here. A hemorrhoid is
# diagnosed by proctoscopy and a sore throat by looking at it; inventing a
# film for them would produce a chart no coder in the room would believe.
RADIOLOGY = {
    "C50.9": ("Mammogram both breasts with ultrasound",
              "Right breast: irregular hypoechoic mass 2.4 x 1.8 cm at 10 o'clock position, "
              "3 cm from the nipple, with indistinct margin. BI-RADS 4b. "
              "No axillary lymphadenopathy. Left breast unremarkable."),
    "D17.1": ("Ultrasound soft tissue, back",
              "Well-defined oval hyperechoic lesion 4.2 x 2.1 cm in the subcutaneous plane, "
              "no internal vascularity on colour Doppler. Findings consistent with lipoma."),
    # For the hand-written original 87026072310024100701, whose procedure really
    # is 88.79 Ultrasound Endovaginal. Every measurement below is read off that
    # visit's own Present Illness ("TVS today: Ut 6.3x3.2 cm, ET 3.1 mm, Lt
    # dermoid 2.2x1.9 cm stable, ROV normal, no free fluid") -- this is the
    # chart's own findings written out as a report, not a new clinical claim.
    "D27": ("Ultrasound endovaginal",
            "Uterus 6.3 x 3.2 cm, endometrial thickness 3.1 mm. Left ovary: well-defined "
            "cyst 2.2 x 1.9 cm containing an echogenic focus with posterior shadowing, "
            "unchanged from the previous study. Right ovary normal. No free fluid."),
    "E04.1": ("Ultrasound thyroid gland",
              "Right lobe: well-defined solid isoechoic nodule 3.1 x 2.2 cm, TIRADS 3, "
              "no microcalcification. Left lobe and isthmus normal. No cervical lymphadenopathy."),
    "E11.5": ("X-ray right foot, AP and oblique",
              "Soft tissue swelling at the plantar aspect. No periosteal reaction, "
              "no bone destruction and no gas in the soft tissue. "
              "No radiological evidence of osteomyelitis."),
    "E14.3": ("Ultrasound B-scan, right eye",
              "Posterior segment: no vitreous haemorrhage, retina attached. "
              "Axial length 23.4 mm. Dense lens opacity confirmed."),
    "G56.0": ("X-ray right wrist, PA and lateral",
              "No fracture or dislocation. Carpal bones intact and joint spaces preserved. "
              "No degenerative or erosive change."),
    "K35.8": ("Ultrasound lower abdomen",
              "Non-compressible blind-ending tubular structure 9 mm in diameter at the right "
              "iliac fossa with peri-appendiceal fat stranding and a small amount of free fluid. "
              "Findings consistent with acute appendicitis."),
    "K80.2": ("Ultrasound upper abdomen",
              "Gallbladder contains multiple mobile echogenic foci with posterior acoustic "
              "shadowing, largest 1.2 cm. Wall thickness 3 mm, no pericholecystic fluid. "
              "Common bile duct not dilated (4 mm). Liver, pancreas and both kidneys normal."),
    "L02.4": ("Ultrasound soft tissue, right hip",
              "Hypoechoic collection 4.5 x 3.2 cm with internal debris and peripheral "
              "hyperaemia in the subcutaneous plane. Findings consistent with an abscess."),
    "J18.9": ("Chest X-ray, PA upright",
              "Patchy alveolar infiltration at the right lower lung zone. "
              "Costophrenic angles clear, heart size normal, no pneumothorax."),
    "N20.0": ("Ultrasound kidneys, ureters and bladder",
              "Echogenic focus 8 mm with posterior shadowing at the left renal pelvis, "
              "mild left hydronephrosis. Right kidney normal. Bladder unremarkable."),
    "N40": ("Ultrasound kidneys, ureters and bladder",
            "Prostate enlarged, volume 48 mL, with intravesical protrusion. "
            "Post-void residual urine 95 mL. Both kidneys normal, no hydronephrosis, "
            "no bladder stone."),
    "R10.4": ("Ultrasound whole abdomen",
              "No free fluid. Liver, gallbladder, pancreas, spleen and both kidneys "
              "unremarkable. Appendix not visualised. Bowel gas pattern normal."),
    "R42": ("Echocardiogram, transthoracic",
            "Normal chamber sizes. Left ventricular ejection fraction 62 percent, "
            "no regional wall motion abnormality. No valvular stenosis, trivial mitral "
            "regurgitation. No intracardiac thrombus."),
    "R51": ("CT brain without contrast",
            "No intracranial haemorrhage, mass or midline shift. "
            "Grey-white differentiation preserved. Paranasal sinuses clear."),
    "S01.8": ("X-ray skull, AP and lateral",
              "No skull fracture. No radio-opaque foreign body in the soft tissue. "
              "Sella and sutures normal."),
    "S61.0": ("X-ray right hand, PA and oblique",
              "No fracture or dislocation. No radio-opaque foreign body. "
              "Soft tissue swelling over the affected finger."),
}

# The ten showcase visits, by principal diagnosis. Every one of them is a
# procedural presentation with an OPERATING-ROOM procedure, so the report
# header reads CC&PI / PE / MX / Order / Lab / X-ray / Operative -- a full
# chart to walk a room through. They are also the ten lowest ICD-10 codes in
# the Complete tab and the ten most recent visits, so they lead the list under
# both the default A-Z sort and "newest first".
#
# K64.2 (hemorrhoid) is deliberately NOT among them: it is the one operative
# presentation here that gets no imaging, and a showcase case with an invented
# film is worse than one fewer showcase case.
SHOWCASE = ["C50.9", "D17.1", "E04.1", "E11.5", "E14.3",
            "G56.0", "K35.8", "K64.2", "K80.2", "L02.4"]

# Everyday complete visits draw from these only. Every code here sorts AFTER
# the showcase codes, which is what keeps the showcase at the top of the
# Complete tab -- the list's default order is the case's primary code, A-Z.
EVERYDAY_COMPLETE = ["M17.1", "M54.5", "N20.0", "N40", "R10.4", "R42", "R51",
                     "S01.8", "S61.0"]

# Past history lines for the showcase charts -- the section a coder reads for
# comorbidity. Deliberately consistent with the COMORBIDITIES pool.
PAST_HX = [
    "เป็นความดันโลหิตสูงมา 8 ปี รับประทานยาสม่ำเสมอ ไม่เคยผ่าตัด",
    "เป็นเบาหวานชนิดที่ 2 มา 10 ปี และไขมันในเลือดสูง ติดตามการรักษาต่อเนื่อง",
    "เคยผ่าตัดไส้ติ่งเมื่อ 15 ปีก่อน ปฏิเสธโรคประจำตัวอื่น",
    "ปฏิเสธโรคประจำตัว ไม่สูบบุหรี่ ไม่ดื่มสุรา",
    "เป็นความดันโลหิตสูงและไขมันในเลือดสูง รับประทานยาต่อเนื่อง 5 ปี",
]


# ------------------------------------------------- filling out the top rows
# A demo is only as good as the first rows of each tab, and those rows were the
# THINNEST charts in the set -- two of them carried no labs, no imaging and no
# past history at all. This table fills them out. It changes no visit, no id and
# no code: it only ADDS the rows the extract left out.
#
# Which visits are these? The ones the dashboard puts at the top, which is a
# different rule per tab:
#   Complete    ordered A-Z by principal ICD-10 (useCaseFilters' "code-asc").
#   Incomplete  grouped by order type, Surgery first (ORDER_PRIORITY), then
#               A-Z by code -- which for a case with no diagnosis is its ICD-9.
#   Finished    empty at demo start: sync stamps every case case_status='open'
#               and never reads the hospital's coding_status back, so nothing
#               is there until a coder approves.
# Re-derive the list with the query in README's *The demo dataset* if the data
# ever changes; main() asserts every id below still exists, so a generator
# change that moves them fails loudly instead of silently enriching nothing.
#
# Each entry is fixed from what the extract ACTUALLY holds for that visit, never
# computed from the database, so a second run adds exactly what the first added
# and the delete below takes exactly that back out. Nothing already present is
# duplicated: a visit that already has a film gets no second film, and a panel
# it already ran is not re-ordered.
ENRICH_VISITS = {
    # visit id: (scenario for lab skew + borrowed note text | None,
    #            lab panels to add, RADIOLOGY key for a film | None,
    #            OPD Record fields the extract left out)

    # --- head of the Complete tab (rows 2 and 4 are already full) ---
    "87026071715292512901": ("C50.9", [], "C50.9", []),
    "87026072813401900901": ("D17.1", ["CBC", "Electrolyte", "Creatinine"], "D17.1",
                             ["Chief Complaint", "Plan", "Family History"]),
    "87026072310024100701": (None, ["CBC", "Electrolyte", "Creatinine"], "D27",
                             ["Physical Examination", "Plan"]),

    # --- head of the Incomplete tab: the Surgery group, then the first
    #     CT / X-ray row, because that group holds only four cases ---
    "87026072912152303801": ("E04.1", [], None, []),
    "87026081316325609701": ("L02.4", ["Electrolyte", "Creatinine"], None, []),
    "87026070209225703901": ("E11.5", [], "E11.5", []),
    "87026060509372112701": ("S01.8", ["Electrolyte", "Creatinine"], "S01.8", []),
    "87026072915054701201": ("R51", ["CBC", "Electrolyte", "Creatinine"], None, []),
}

# The two lines 87026072310024100701 lacks. D27 is the one visit here with no
# scenario in S, so its text cannot be copied; these are written from the
# visit's own Assessment ("Recurrent Lt ovarian dermoid cyst, stable size --
# continue conservative F/U") and its own TVS measurements.
D27_NOTES = {
    "Physical Examination": [
        "General Appearance: good consciousness, not distressed",
        "Abdomen: soft, not tender, no palpable mass",
        "Pelvic: uterus normal size, no adnexal tenderness",
    ],
    "Plan": "Continue conservative follow up, repeat TVS in 6 months",
}

# Past history is otherwise drawn from the pool at random, which is fine on a
# chart where nothing in the note constrains it. Where the doctor's own words DO
# constrain it, name the line instead. 87026070209225703901's assessment reads
# "Infected diabetic foot ulcer, right ... glycemic control", so a past history
# mentioning only hypertension reads as a contradiction to anyone clinical --
# and it is the third row of the Incomplete tab, so it gets read.
PAST_HX_FOR = {
    "87026070209225703901": PAST_HX[1],   # type 2 DM 10 years + dyslipidaemia
}

# Child-row counter for the rows added above. build_visit numbers a visit's own
# rows from 100, so 9000+ cannot collide -- and it puts a '9' at position 15 of
# the generated id, which is what lets the cleanup remove an earlier run's
# additions without touching the extract's own rows (theirs hold a '0').
ENRICH_SEQ = 9000


# --------------------------------------------------------------- utilities

def q(v):
    """SQL literal for a text column; None -> NULL."""
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def visit_id(when, seq):
    """870 + YYMMDDHHMMSS + 5-digit sequence -- the hospital's own format.

    medcode-api's analytics parses positions 4-15 as YYMMDDHH24MISS to date a
    visit, so this layout is load-bearing, not cosmetic.
    """
    return "870" + when.strftime("%y%m%d%H%M%S") + f"{seq:03d}01"


def sub_id(vid, n):
    """A child row id: the visit's first 14 chars + a 4-digit counter + '01'."""
    return vid[:14] + f"{n:04d}" + "01"


def age_parts(birth, when):
    """Thai extract's 'years,months,days' age string."""
    y = when.year - birth.year
    m = when.month - birth.month
    d = when.day - birth.day
    if d < 0:
        m -= 1
        d += 30
    if m < 0:
        y -= 1
        m += 12
    return f"{y},{m},{d}"


def lab_value(lo, hi, dec):
    v = RNG.uniform(lo, hi)
    return str(int(round(v))) if dec == 0 else f"{v:.{dec}f}"


class Rows:
    """Accumulates INSERT tuples per table, emitted as one SQL script."""

    def __init__(self):
        self.t = {}

    def add(self, table, cols, vals):
        self.t.setdefault((table, cols), []).append(vals)

    def sql(self):
        out = []
        for (table, cols), vals in self.t.items():
            out.append(f"INSERT INTO imed.{table} ({', '.join(cols)}) VALUES")
            out.append(",\n".join("  (" + ", ".join(q(v) for v in row) + ")" for row in vals) + ";")
        return "\n".join(out)


# --------------------------------------------------------------- generation

def build_visit(rows, when, seq, sc, bucket, ipd=None, comorbid=0, rich=False):
    """Emit every child row for one visit. Returns the visit id.

    rich=True builds a SHOWCASE chart: the past-history section a coder reads
    for comorbidity, two extra lab panels, and the radiology report that turns
    the report header's "X-ray —" into a real study. Everything else is the
    same code path, so a showcase visit is a normal visit with more of the
    record filled in, never a differently-shaped one.
    """
    vid = visit_id(when, seq)
    ts = when.strftime("%Y-%m-%d %H:%M:%S")
    n = 100  # child-row counter; diagnoses use the 200 range

    # --- patient -----------------------------------------------------------
    # A gynaecological presentation has to be female for the chart to make
    # sense to a coder reading it.
    gyn = sc["icd10"][0] == "D27" or (sc["icd9"] or ("",))[0] == "88.79"
    sex = "female" if gyn else RNG.choice(["male", "female"])
    age = RNG.randint(16, 82)
    birth = dt.date(when.year - age, RNG.randint(1, 12), RNG.randint(1, 28))
    pregnant = "N"
    if sex == "female" and 18 <= age <= 45 and RNG.random() < 0.08:
        pregnant = "Y"

    if ipd:
        adm = when
        dis = when + dt.timedelta(days=RNG.randint(2, 7), hours=RNG.randint(1, 8))
        rows.add("medhack_patient",
                 ("transactionnumber", "admissionnumber", "birthdate", "ageyear",
                  "admissiondatetime", "dischargedatetime", "dischargetype",
                  "dischargestatus", "ispregnant", "sex", "healthcoverage", "coding_status"),
                 (vid, f"AN{when.strftime('%y%m')}{seq:04d}",
                  birth.strftime("%Y-%m-%d 00:00:00"), age_parts(birth, when),
                  adm.strftime("%Y-%m-%d %H:%M:%S"), dis.strftime("%Y-%m-%d %H:%M:%S"),
                  RNG.choice(["Complete Treatment", "Doctor Approved Discharge"]),
                  RNG.choice(["Improved", "Complete Recovery"]),
                  pregnant, sex, RNG.choice(COVERAGE),
                  "approved" if bucket == "finished" else None))
        dept_label, ward = IPD_DEPT[ipd]
        rows.add("medhack_bedmanagement",
                 ("transactionnumber", "serviceid", "department", "ward", "bednumber",
                  "startdatetime", "enddatetime"),
                 (vid, sub_id(vid, 101), dept_label, ward,
                  f"{RNG.randint(1, 4)}0{RNG.randint(1, 9)}",
                  adm.strftime("%Y-%m-%d %H:%M:%S"), dis.strftime("%Y-%m-%d %H:%M:%S")))
        discharge_ts = dis.strftime("%Y-%m-%d %H:%M:%S")
        progress_ts = (adm + dt.timedelta(days=1, hours=2)).strftime("%Y-%m-%d %H:%M:%S")
    else:
        rows.add("medhack_patient",
                 ("transactionnumber", "admissionnumber", "birthdate", "ageyear",
                  "admissiondatetime", "dischargedatetime", "dischargetype",
                  "dischargestatus", "ispregnant", "sex", "healthcoverage", "coding_status"),
                 (vid, None, birth.strftime("%Y-%m-%d 00:00:00"), age_parts(birth, when),
                  None, None, None, None, pregnant, sex, RNG.choice(COVERAGE),
                  "approved" if bucket == "finished" else None))
        # OPD: department and the visit window, but no ward and no bed.
        rows.add("medhack_bedmanagement",
                 ("transactionnumber", "serviceid", "department", "ward", "bednumber",
                  "startdatetime", "enddatetime"),
                 (vid, sub_id(vid, 101), DEPT[sc["dept"]], None, None, ts,
                  (when + dt.timedelta(minutes=RNG.randint(35, 190))).strftime("%Y-%m-%d %H:%M:%S")))
        discharge_ts = progress_ts = None

    # --- vital signs -------------------------------------------------------
    rows.add("medhack_vitalsign",
             ("transactionnumber", "measuredatetime", "temperature",
              "diastolicbloodpressure", "systolicbloodpressure", "heartrate",
              "oxygensaturation", "weight", "height"),
             (vid, ts, f"{RNG.uniform(36.2, 39.1):.1f}", str(RNG.randint(62, 96)),
              str(RNG.randint(102, 168)), str(RNG.randint(58, 112)),
              str(RNG.randint(94, 100)), f"{RNG.uniform(42, 92):.1f}",
              str(RNG.randint(148, 182))))

    # --- clinical notes ----------------------------------------------------
    def rec(doc, field, value, at=None):
        rows.add("medhack_medicalrecord",
                 ("transactionnumber", "documenttype", "fieldname", "value", "recorddatetime"),
                 (vid, doc, field, value, at or ts))

    # Document types are a defined set (docs/medical-glossary.md §6): OPD
    # Record, Admission Note, Progress Note, Clinical Summary. An outpatient
    # visit is one OPD Record; an admission is written up across three
    # documents, and ICD-10-TM Volume 5 makes the Clinical Summary (the
    # discharge summary) the PRIMARY source for choosing the principal
    # diagnosis -- so an inpatient chart without one cannot be coded properly.
    if ipd:
        rec("Admission Note", "Chief Complaint", sc["cc"])
        rec("Admission Note", "Present Illness", sc["pi"])
        for line in sc["pe"]:
            rec("Admission Note", "Physical Examination", line)
        rec("Admission Note", "Family History", RNG.choice(FAMILY_HX))
        rec("Admission Note", "Food-Drug Allergy", RNG.choice(ALLERGY))
        rec("Progress Note", "Progression", RNG.choice(PROGRESSION), progress_ts)
        rec("Clinical Summary", "Assessment", sc["assess"], discharge_ts)
        rec("Clinical Summary", "Plan", sc["plan"], discharge_ts)
    else:
        rec("OPD Record", "Chief Complaint", sc["cc"])
        rec("OPD Record", "Present Illness", sc["pi"])
        for line in sc["pe"]:
            rec("OPD Record", "Physical Examination", line)
        rec("OPD Record", "Assessment", sc["assess"])
        rec("OPD Record", "Plan", sc["plan"])
        rec("OPD Record", "Family History", RNG.choice(FAMILY_HX))
        rec("OPD Record", "Food-Drug Allergy", RNG.choice(ALLERGY))
        if rich:
            # The section a coder reads for comorbidity. Only on the showcase
            # charts: the extract's own OPD records rarely carry one.
            rec("OPD Record", "Past History", RNG.choice(PAST_HX))

    # --- labs (orderlab + the matching Diagnostic Report rows) -------------
    # A showcase chart is worked up properly: whatever the presentation orders,
    # plus the two panels any Thai OPD sends before a procedure.
    panels = list(sc["labs"])
    if rich:
        for extra in ("CBC", "Electrolyte", "Creatinine"):
            if extra not in panels:
                panels.append(extra)
    for panel in panels:
        tmlt, cgd, items = PANELS[panel]
        report = when + dt.timedelta(minutes=RNG.randint(25, 95))
        rts = report.strftime("%Y-%m-%d %H:%M:%S")
        n += 1
        itemid = sub_id(vid, n)
        # A chart has to hang together: the numbers must support the doctor's
        # assessment. Without this the generator produces pneumonia charts with
        # a normal white count, which is worse than no labs at all -- a coder
        # (and the RAG suggester) reads the panel as evidence.
        skew = sc.get("abn", {})
        for iname, uom, lo, hi, dec in items:
            n += 1
            rng_lo, rng_hi = skew.get(iname, (lo, hi))
            val = lab_value(rng_lo, rng_hi, dec)
            rows.add("medhack_orderlab",
                     ("transactionnumber", "id", "panelname", "paneltmlt", "panelcgd",
                      "collectdatetime", "reportdatetime", "itemid", "itemtmlt",
                      "itemcgd", "itemname", "itemvalue", "itemuom"),
                     (vid, sub_id(vid, n), panel, tmlt, cgd, ts, rts, itemid,
                      tmlt, cgd, iname, val, uom))
            rows.add("medhack_medicalrecord_result",
                     ("transactionnumber", "tmlt", "cgd", "name", "documenttype",
                      "fieldid", "fieldname", "subfieldname", "value", "uom", "recorddatetime"),
                     (vid, tmlt, cgd, panel, "Diagnostic Report", vid[:11],
                      "Specimen", iname, val, uom, rts))
        # iMed emits a per-panel "Comment" row alongside the results. It holds
        # the lab's interpretive note -- free text, so no unit. (The extract's
        # other structural row, "Attach File", is not emitted here: nothing is
        # attached to a generated panel, and an empty attachment row would just
        # render as a blank line in the case view.)
        n += 1
        rows.add("medhack_orderlab",
                 ("transactionnumber", "id", "panelname", "paneltmlt", "panelcgd",
                  "collectdatetime", "reportdatetime", "itemid", "itemtmlt",
                  "itemcgd", "itemname", "itemvalue", "itemuom"),
                 (vid, sub_id(vid, n), panel, tmlt, cgd, ts, rts, itemid,
                  tmlt, cgd, "Comment", RNG.choice(LAB_COMMENTS), None))

    # --- imaging (Radiology Report rows -> the X-ray column) ---------------
    # Same table as the lab results; documenttype is what tells them apart.
    film = RADIOLOGY.get(sc["icd10"][0])
    if film and (rich or RNG.random() < 0.35):
        study, findings = film
        read_at = (when + dt.timedelta(minutes=RNG.randint(30, 120))
                   ).strftime("%Y-%m-%d %H:%M:%S")
        n += 1
        rows.add("medhack_medicalrecord_result",
                 ("transactionnumber", "tmlt", "cgd", "name", "documenttype",
                  "fieldid", "fieldname", "subfieldname", "value", "uom",
                  "recorddatetime"),
                 (vid, "300500", "30301", study, "Radiology Report", vid[:11],
                  "Report", "Impression", findings, None, read_at))

    # --- drugs -------------------------------------------------------------
    for key in sc["drugs"]:
        name, iid, tmt, sig, sig_th, qty = DRUGS[key]
        n += 1
        rows.add("medhack_orderdrug",
                 ("transactionnumber", "id", "name", "itemid", "tmt",
                  "dosagesignature", "dosageinstruction", "quantity", "remark",
                  "receiveddatetime"),
                 (vid, sub_id(vid, n), name, iid, tmt, sig, sig_th, qty,
                  "จ่ายยาจากห้องยาผู้ป่วยนอก", ts))

    # --- billing -----------------------------------------------------------
    n += 1
    rows.add("medhack_billingitem",
             ("transactionnumber", "id", "name", "itemid", "tmlt", "cgd",
              "feeschedule", "quantity", "remark", "verifydatetime"),
             (vid, sub_id(vid, n), "ค่าบริการสถานพยาบาล-Hospital Charge", "NEW25",
              "900001", "55020", "55020", "1", "เหมาจ่ายค่าบริการสถานพยาบาล", ts))
    n += 1
    rows.add("medhack_billingitem",
             ("transactionnumber", "id", "name", "itemid", "tmlt", "cgd",
              "feeschedule", "quantity", "remark", "verifydatetime"),
             (vid, sub_id(vid, n),
              "ค่าบริการผู้ป่วยใน" if ipd else "ค่าบริการผู้ป่วยนอก",
              "MD00199", "900002", "55021", "55021", "1",
              "ค่าบริการทางการแพทย์ตามสิทธิ", ts))

    # --- the codes that decide the bucket ----------------------------------
    want_icd10 = bucket in ("complete", "finished") or bucket == "icd10_only"
    want_icd9 = bucket in ("complete", "finished") or bucket == "icd9_only"
    if sc["icd9"] is None:
        want_icd9 = False  # no procedure exists for this presentation

    if want_icd10:
        rows.add("medhack_diagnosis_icd10",
                 ("transactionnumber", "encountertype", "id", "name", "icd",
                  "diagnosistype", "is_cancelled", "updated_at"),
                 (vid, "1" if ipd else "0", sub_id(vid, 201), sc["icd10"][1],
                  sc["icd10"][0], "PRIMARY_DIAGNOSIS", None, None))
        # Comorbidities: chronic conditions the patient already had on arrival.
        # The hospital sends these as diagnosistype COMORBIDITY, which
        # SyncRules.DIAG_ROLE maps to secondary_diagnosis. Never the same code
        # as the principal diagnosis, and only ever alongside one -- a
        # comorbidity with no principal diagnosis is not a coherent chart.
        pool = [c for c in COMORBIDITIES if c[0] != sc["icd10"][0]]
        for j, (code, name) in enumerate(RNG.sample(pool, min(comorbid, len(pool)))):
            rows.add("medhack_diagnosis_icd10",
                     ("transactionnumber", "encountertype", "id", "name", "icd",
                      "diagnosistype", "is_cancelled", "updated_at"),
                     (vid, "1" if ipd else "0", sub_id(vid, 202 + j), name, code,
                      "COMORBIDITY", None, None))
    if want_icd9:
        code, pname, optype = sc["icd9"]
        start = when + dt.timedelta(minutes=RNG.randint(40, 150))
        end = start + dt.timedelta(minutes=RNG.randint(15, 75))
        rows.add("medhack_procedure_icd9",
                 ("transactionnumber", "encountertype", "id", "name", "icd",
                  "startdatetime", "enddatetime", "operationtype", "is_cancelled", "updated_at"),
                 (vid, "1" if ipd else "0", sub_id(vid, 124), pname, code,
                  start.strftime("%Y-%m-%d %H:%M:%S"), end.strftime("%Y-%m-%d %H:%M:%S"),
                  optype, None, None))
    return vid


def visit_when(vid):
    """The datetime a visit id encodes -- positions 3..15 are YYMMDDHHMMSS."""
    return dt.datetime.strptime(vid[3:15], "%y%m%d%H%M%S")


def enrich_visits(rows, by_code):
    """Fill out the charts the dashboard shows first (see ENRICH_VISITS).

    Adds the panels the presentation would really have ordered, the film it
    would really have taken, the past-history section a coder reads for
    comorbidity, and whichever standard OPD Record fields the extract left out.
    It never touches a visit's identity, its diagnosis or its procedure, and it
    never rewrites a line of the hand-written Thai narrative.

    Returns the DELETE statements that take a previous run's additions back out
    so the script stays idempotent. They are only needed for the 21 originals --
    every other visit is dropped and rebuilt wholesale further up -- and they are
    keyed so they can never match a row the extract itself supplied.
    """
    deletes = []
    orig_targets = [v for v in ENRICH_VISITS if v in ORIGINAL]
    if orig_targets:
        ids = ", ".join(q(v) for v in orig_targets)
        # Lab rows added here carry a '9' at position 15 of their id, where the
        # extract's own rows carry a '0'.
        deletes.append(f"DELETE FROM imed.medhack_orderlab WHERE transactionnumber IN ({ids})"
                       " AND substr(id, 15, 1) = '9';")

    for vid, (code, panels, film, fields) in ENRICH_VISITS.items():
        when = visit_when(vid)
        ts = when.strftime("%Y-%m-%d %H:%M:%S")
        sc = by_code[code] if code else None
        n = ENRICH_SEQ

        if vid in ORIGINAL:
            # medicalrecord_result has no id column, so its delete is keyed on
            # the exact (name) values this run inserts -- all of which the
            # extract demonstrably lacks on these visits.
            names = list(panels) + ([RADIOLOGY[film][0]] if film else [])
            if names:
                deletes.append(
                    f"DELETE FROM imed.medhack_medicalrecord_result WHERE transactionnumber = {q(vid)}"
                    f" AND name IN ({', '.join(q(x) for x in names)});")
            deletes.append(
                f"DELETE FROM imed.medhack_medicalrecord WHERE transactionnumber = {q(vid)}"
                f" AND fieldname IN ({', '.join(q(f) for f in list(fields) + ['Past History'])});")

        # --- labs: same shape as build_visit (orderlab + Diagnostic Report) ---
        for panel in panels:
            tmlt, cgd, items = PANELS[panel]
            rts = (when + dt.timedelta(minutes=RNG.randint(25, 95))).strftime("%Y-%m-%d %H:%M:%S")
            n += 1
            itemid = sub_id(vid, n)
            skew = sc.get("abn", {}) if sc else {}
            for iname, uom, lo, hi, dec in items:
                n += 1
                rng_lo, rng_hi = skew.get(iname, (lo, hi))
                val = lab_value(rng_lo, rng_hi, dec)
                rows.add("medhack_orderlab",
                         ("transactionnumber", "id", "panelname", "paneltmlt", "panelcgd",
                          "collectdatetime", "reportdatetime", "itemid", "itemtmlt",
                          "itemcgd", "itemname", "itemvalue", "itemuom"),
                         (vid, sub_id(vid, n), panel, tmlt, cgd, ts, rts, itemid,
                          tmlt, cgd, iname, val, uom))
                rows.add("medhack_medicalrecord_result",
                         ("transactionnumber", "tmlt", "cgd", "name", "documenttype",
                          "fieldid", "fieldname", "subfieldname", "value", "uom", "recorddatetime"),
                         (vid, tmlt, cgd, panel, "Diagnostic Report", vid[:11],
                          "Specimen", iname, val, uom, rts))
            n += 1
            rows.add("medhack_orderlab",
                     ("transactionnumber", "id", "panelname", "paneltmlt", "panelcgd",
                      "collectdatetime", "reportdatetime", "itemid", "itemtmlt",
                      "itemcgd", "itemname", "itemvalue", "itemuom"),
                     (vid, sub_id(vid, n), panel, tmlt, cgd, ts, rts, itemid,
                      tmlt, cgd, "Comment", RNG.choice(LAB_COMMENTS), None))

        # --- imaging ---------------------------------------------------------
        if film:
            study, findings = RADIOLOGY[film]
            read_at = (when + dt.timedelta(minutes=RNG.randint(30, 120))
                       ).strftime("%Y-%m-%d %H:%M:%S")
            rows.add("medhack_medicalrecord_result",
                     ("transactionnumber", "tmlt", "cgd", "name", "documenttype",
                      "fieldid", "fieldname", "subfieldname", "value", "uom", "recorddatetime"),
                     (vid, "300500", "30301", study, "Radiology Report", vid[:11],
                      "Report", "Impression", findings, None, read_at))

        # --- the notes the extract left out ---------------------------------
        def rec(field, value):
            rows.add("medhack_medicalrecord",
                     ("transactionnumber", "documenttype", "fieldname", "value", "recorddatetime"),
                     (vid, "OPD Record", field, value, ts))

        for field in fields:
            if sc is None:                      # D27: written from its own chart
                val = D27_NOTES[field]
                for line in (val if isinstance(val, list) else [val]):
                    rec(field, line)
            elif field == "Chief Complaint":
                rec(field, sc["cc"])
            elif field == "Present Illness":
                rec(field, sc["pi"])
            elif field == "Physical Examination":
                for line in sc["pe"]:
                    rec(field, line)
            elif field == "Assessment":
                rec(field, sc["assess"])
            elif field == "Plan":
                rec(field, sc["plan"])
            elif field == "Family History":
                rec(field, RNG.choice(FAMILY_HX))
            elif field == "Food-Drug Allergy":
                rec(field, RNG.choice(ALLERGY))
        # The draw happens either way, so naming one visit's line above cannot
        # shift the RNG stream for the visits built after it.
        drawn = RNG.choice(PAST_HX)
        rec("Past History", PAST_HX_FOR.get(vid, drawn))

    return deletes


def main():
    rows = Rows()

    # Target mix, counting the 21 hand-written originals (5 complete +
    # 16 incomplete). 119 new OPD visits:
    #   45 complete + 10 showcase, 20 finished, 44 incomplete.
    # Final dashboard split: 60 complete / 60 incomplete / 20 finished.
    # The showcase ten are built separately, after this loop.
    buckets = (["complete"] * 45 + ["finished"] * 20
               + ["incomplete"] * 18 + ["icd10_only"] * 15 + ["icd9_only"] * 11)
    assert len(buckets) == 109, len(buckets)
    RNG.shuffle(buckets)

    # A bucket that needs an ICD-9 can only be built from a presentation that
    # actually has a procedure -- otherwise we would be claiming a visit was
    # approved while its procedure coding is still missing, which no coder
    # would ever sign off.
    with_proc = [s for s in S if s["icd9"] is not None]
    by_code = {s["icd10"][0]: s for s in S}
    # The Complete tab is ordered by the case's primary code, A-Z. Everyday
    # complete visits are drawn ONLY from codes that sort after the showcase
    # ten, so the showcase stays at the top of the list a coder opens.
    everyday = [by_code[c] for c in EVERYDAY_COMPLETE]
    showcase = [by_code[c] for c in SHOWCASE]
    assert all(s["icd9"] for s in showcase + everyday), "a complete visit needs a procedure"

    # Spread across 2026-06-01 .. 2026-08-20 so a windowed sync has to split
    # into more than one <=31-day chunk, and analytics has a real time series.
    start = dt.date(2026, 6, 1)
    days = 80
    seq = 22
    generated = []
    for i, bucket in enumerate(buckets):
        day = start + dt.timedelta(days=RNG.randrange(days))
        when = dt.datetime(day.year, day.month, day.day,
                           RNG.randint(8, 16), RNG.randint(0, 59), RNG.randint(0, 59))
        if bucket == "complete":
            sc = everyday[i % len(everyday)]
        elif bucket in ("finished", "icd9_only"):
            sc = with_proc[i % len(with_proc)]
        else:
            sc = S[i % len(S)]
        # Roughly a fifth of coded cases carry enough comorbidity to read as
        # medium severity and a tenth as high, so the severity column actually
        # varies instead of being "low" on every row.
        if bucket in ("complete", "finished", "icd10_only"):
            comorbid = (3 + i % 2) if i % 10 == 0 else (1 + i % 2 if i % 5 == 0 else 0)
        else:
            comorbid = 0
        generated.append(build_visit(rows, when, seq, sc, bucket, comorbid=comorbid))
        seq += 1

    # --- the ten showcase visits -------------------------------------------
    # Dated last (14-20 August, one per day plus three doubled up) so they are
    # also the ten most recent cases: they lead the Complete tab under the
    # default A-Z-by-code sort AND under "newest first". Each carries a
    # comorbidity or two, because a chart with none reads as a training
    # exercise rather than a patient.
    for i, sc in enumerate(showcase):
        day = dt.date(2026, 8, 14) + dt.timedelta(days=i % 7)
        when = dt.datetime(day.year, day.month, day.day,
                           8 + (i % 8), RNG.randint(0, 59), RNG.randint(0, 59))
        generated.append(build_visit(rows, when, seq, sc, "complete",
                                     comorbid=1 + (i % 3), rich=True))
        seq += 1

    # Ten IPD admissions. These are the rows that exercise admissionnumber,
    # admission/discharge datetimes, ward and bednumber -- the columns an OPD
    # visit correctly leaves empty. They do NOT appear on the dashboard
    # (CasesRepository filters encountertype='0'); they show in case detail,
    # the R1-R6 read contract and analytics.
    ipd_scenarios = with_proc
    for i in range(10):
        day = start + dt.timedelta(days=RNG.randrange(days))
        when = dt.datetime(day.year, day.month, day.day,
                           RNG.randint(7, 20), RNG.randint(0, 59), RNG.randint(0, 59))
        sc = ipd_scenarios[i % len(ipd_scenarios)]
        bucket = ["complete", "finished", "incomplete"][i % 3]
        generated.append(build_visit(rows, when, seq, sc, bucket,
                                     ipd=sc["dept"] if sc["dept"] in IPD_DEPT else "MED",
                                     comorbid=i % 4))
        seq += 1

    # The top-of-tab charts are addressed by visit id, and 129 of those ids are
    # produced by the loops above -- deterministic, but only as long as nobody
    # changes the bucket mix or the RNG call order. Fail loudly here rather than
    # silently enriching nothing.
    known = set(generated) | set(ORIGINAL)
    unknown = [v for v in ENRICH_VISITS if v not in known]
    assert not unknown, (
        "ENRICH_VISITS names visits this run did not build: " + ", ".join(unknown)
        + " -- the generator changed and the tab ordering must be re-derived")

    keep = ", ".join(q(v) for v in ORIGINAL)
    child_tables = [
        "medhack_bedmanagement", "medhack_billingitem", "medhack_diagnosis_icd10",
        "medhack_medicalrecord", "medhack_medicalrecord_result", "medhack_orderdrug",
        "medhack_orderlab", "medhack_procedure_icd9", "medhack_vitalsign",
    ]

    script = ["BEGIN;", "SET search_path TO imed;", ""]
    script.append("-- Idempotence: drop everything a previous run generated. The 21")
    script.append("-- hand-written originals are preserved by id.")
    for t in child_tables:
        script.append(f"DELETE FROM imed.{t} WHERE transactionnumber NOT IN ({keep});")
    script.append(f"DELETE FROM imed.medhack_patient WHERE transactionnumber NOT IN ({keep});")
    script.append("")
    script.append("-- Undo write-backs against the 21 originals. A demo run or a test run")
    script.append("-- (medcode-api's approve/reopen suite writes to real hospital rows)")
    script.append("-- leaves extra diagnosis/procedure rows behind; without this the next")
    script.append("-- dump would ship them as if they were seed data. Keep only the code")
    script.append("-- rows the originals genuinely arrived with.")
    script.append(f"DELETE FROM imed.medhack_diagnosis_icd10 WHERE id NOT IN ({SEED_DX})"
                  f" AND transactionnumber IN ({keep});")
    script.append(f"DELETE FROM imed.medhack_procedure_icd9 WHERE id NOT IN ({SEED_PX})"
                  f" AND transactionnumber IN ({keep});")
    script.append("DELETE FROM imed.doctor_discharge_opd;")
    script.append("DELETE FROM imed.doctor_discharge_ipd;")
    script.append("DELETE FROM imed.imed_request_log;")
    script.append("UPDATE imed.medhack_patient SET coding_status = NULL;")
    script.append("-- A reopen marks the hospital row cancelled rather than deleting it, so")
    script.append("-- the surviving seed rows can come back with is_cancelled='1' -- which")
    script.append("-- the read contract then filters out, silently emptying a case. Clear")
    script.append("-- the write-back bookkeeping so the originals read as freshly extracted.")
    script.append("UPDATE imed.medhack_diagnosis_icd10 SET is_cancelled = NULL, updated_at = NULL"
                  f" WHERE id IN ({SEED_DX});")
    script.append("UPDATE imed.medhack_procedure_icd9 SET is_cancelled = NULL, updated_at = NULL"
                  f" WHERE id IN ({SEED_PX});")
    script.append("")
    script.append("-- Undo a previous run's fill-out of the top-of-tab charts. Only the 21")
    script.append("-- originals need it -- every other visit was dropped and rebuilt above --")
    script.append("-- and it is keyed so it can only ever match rows this script inserted:")
    script.append("-- the lab rows by the '9' at position 15 of their id (the extract's own")
    script.append("-- carry '0'), the results and notes by the exact panel, study and field")
    script.append("-- names those visits demonstrably lack.")
    script.extend(enrich_visits(rows, by_code))
    script.append("")
    script.append(rows.sql())
    script.append("")
    script.append("-- Backfill: columns the original 21-visit extract left empty but")
    script.append("-- which do have a real value. Admission/discharge/ward/bed are")
    script.append("-- deliberately NOT among them -- see this script's docstring.")
    script.append(BACKFILL)
    script.append("COMMIT;")

    sql = "\n".join(script)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated_demo_data.sql")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(sql + "\n")

    print(f"generated {len(generated)} visits -> {path}")
    # SQL_ONLY=1 writes the script and stops. The demo stack runs Postgres in a
    # container with no psql on the host, so the SQL is applied there instead:
    #   docker compose exec -T db psql -U postgres -d imed -f - < generated_demo_data.sql
    if os.environ.get("SQL_ONLY") == "1":
        return
    r = subprocess.run(["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", path],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stdout + r.stderr)
        sys.exit(1)
    print(f"applied to database '{DB}'")


# Backfill for the original 21 visits. Every UPDATE here is a value that has a
# genuine real-world source; nothing invents a clinical fact.
BACKFILL = r"""
-- 1. healthcoverage: 9 visits arrived with no scheme at all. Assign from the
--    same weighted mix the generated visits use, keyed off the id so the
--    result is stable across runs.
UPDATE imed.medhack_patient SET healthcoverage = v.code
FROM (VALUES
    ('87026072711124400801', 'UCS_89'), ('87026072716380901001', 'WEL_71'),
    ('87026072810245101501', 'UCS_88'), ('87026072813401900901', 'OFC_O1'),
    ('87026072909410201601', 'UCS_89'), ('87026072915054701201', 'WEL_73'),
    ('87026073014031102001', 'UCS_88'), ('87026073109520800501', 'OFC_O3'),
    ('87026073115294701801', 'Cashonly')
) AS v(tn, code)
WHERE imed.medhack_patient.transactionnumber = v.tn
  AND (healthcoverage IS NULL OR btrim(healthcoverage) = '');

-- 2. ispregnant: recorded for every visit at registration. 'N' for men and for
--    women outside childbearing age; the extract simply never carried it.
UPDATE imed.medhack_patient SET ispregnant = 'N' WHERE ispregnant IS NULL;

-- 3. vitalsign: two visits recorded blood pressure and pulse but left the rest
--    empty. Fill one of them with values consistent with its chart.
--
--    The other -- 87026072413210500101, the second reading -- is DELIBERATELY
--    left partial. medcode-api's CasesApiIntegrationTest.syncImportsTheHospital
--    VitalSigns uses it to prove blank hospital values are normalized to null,
--    and asserts on its exact 138/82/88 with weight and height absent. It is
--    also simply realistic: a triage station records blood pressure and pulse
--    and nothing else. Filling it would delete a regression test's only fixture
--    to remove one partial row out of 112.
UPDATE imed.medhack_vitalsign SET temperature = '36.8', oxygensaturation = '97',
       weight = '61.0', height = '154'
WHERE transactionnumber = '87026072808552901401' AND temperature IS NULL;
-- Restore the partial reading if an earlier version of this script filled it.
-- Stated as an explicit reset rather than "don't touch it" so the script lands
-- on the same state no matter what it ran against.
UPDATE imed.medhack_vitalsign
SET temperature = NULL, oxygensaturation = NULL, weight = NULL, height = NULL
WHERE transactionnumber = '87026072413210500101' AND systolicbloodpressure = '138';

-- 4. billing: the hospital-charge line carries the same CGD and fee-schedule
--    codes as the service line; both lines carry a TMLT and a remark.
UPDATE imed.medhack_billingitem SET cgd = '55020', feeschedule = '55020'
WHERE (cgd IS NULL OR btrim(cgd) = '') AND itemid = 'NEW25';
UPDATE imed.medhack_billingitem SET tmlt = '900001'
WHERE (tmlt IS NULL OR btrim(tmlt) = '') AND itemid = 'NEW25';
UPDATE imed.medhack_billingitem SET tmlt = '900002'
WHERE (tmlt IS NULL OR btrim(tmlt) = '') AND itemid = 'MD00199';
UPDATE imed.medhack_billingitem
SET remark = CASE WHEN itemid = 'NEW25' THEN 'เหมาจ่ายค่าบริการสถานพยาบาล'
                  ELSE 'ค่าบริการทางการแพทย์ตามสิทธิ' END
WHERE remark IS NULL OR btrim(remark) = '';

-- 5. drugs: TMT is Thailand's drug code standard. Map by the item id the
--    extract already carries; anything unmapped keeps its own id as the key.
UPDATE imed.medhack_orderdrug SET tmt = v.tmt
FROM (VALUES
    ('DRG0121', '411020'), ('DRG0135', '421205'), ('DRG0136', '413360'),
    ('DRG0137', '410421'), ('DRG0141', '418822'), ('DRG0142', '419015'),
    ('DRG0143', '410902'), ('DRG0144', '412208'), ('DRG0145', '416630'),
    ('DRG0146', '411455'), ('DRG0147', '419120'), ('DRG0148', '418950'),
    ('DRG0149', '417720'), ('DRG0150', '417901'), ('DRG0151', '419602'),
    ('DRG0152', '410880'), ('DRG0153', '411105'), ('DRG0154', '418440'),
    ('DRG0155', '411320'), ('DRG0156', '410610')
) AS v(itemid, tmt)
WHERE imed.medhack_orderdrug.itemid = v.itemid
  AND (imed.medhack_orderdrug.tmt IS NULL OR btrim(imed.medhack_orderdrug.tmt) = '');
UPDATE imed.medhack_orderdrug SET tmt = 'TMT' || substr(itemid, 4)
WHERE tmt IS NULL OR btrim(tmt) = '';
UPDATE imed.medhack_orderdrug SET remark = 'จ่ายยาจากห้องยาผู้ป่วยนอก'
WHERE remark IS NULL OR btrim(remark) = '';

-- 6. diagnostic-report units: fill the unit for results that have one. Rows
--    that are genuinely unitless (Color, Appearance, pH, Protein, Sp.gr.,
--    rapid-test antigens) keep uom NULL -- there is no unit to state.
UPDATE imed.medhack_medicalrecord_result SET uom = v.uom
FROM (VALUES
    ('Hb', 'g/dL'), ('Hct', '%'), ('White Cell Count', 'cells/cu.mm.'),
    ('Platelets Count', 'cells/cu.mm.'), ('Neutrophil', '%'), ('Lymphocyte', '%'),
    ('Eosinophil', '%'), ('Monocyte', '%'), ('Basophil', '%'),
    ('BUN', 'mg/dL'), ('Creatinine', 'mg/dL'), ('eGFR', 'mL/min/1.73m2'),
    ('Fasting Blood Sugar', 'mg/dL'), ('Hb A1C', '%'),
    ('Cholesterol', 'mg/dL'), ('Triglyceride', 'mg/dL'),
    ('HDL-Cholesterol', 'mg/dL'), ('LDL-Cholesterol', 'mg/dL'),
    ('AST', 'U/L'), ('ALT', 'U/L'), ('Alkaline Phosphatase', 'U/L'),
    ('Total Bilirubin', 'mg/dL'), ('Albumin', 'g/dL'),
    ('Sodium', 'mmol/L'), ('Potassium', 'mmol/L'), ('Chloride', 'mmol/L'),
    ('Bicarbonate', 'mmol/L'), ('TSH', 'mIU/L'), ('Free T4', 'ng/dL'),
    ('Urine WBC', '/HPF'), ('Urine RBC', '/HPF'), ('Urine Epithelium', '/HPF')
) AS v(nm, uom)
WHERE imed.medhack_medicalrecord_result.subfieldname = v.nm
  AND (imed.medhack_medicalrecord_result.uom IS NULL
       OR btrim(imed.medhack_medicalrecord_result.uom) = '');
UPDATE imed.medhack_medicalrecord_result SET tmlt = '300099'
WHERE tmlt IS NULL OR btrim(tmlt) = '';

-- 7. lab units: same rule on the order side.
UPDATE imed.medhack_orderlab SET itemuom = v.uom
FROM (VALUES
    ('Hb', 'g/dL'), ('Hct', '%'), ('White Cell Count', 'cells/cu.mm.'),
    ('Platelets Count', 'cells/cu.mm.'), ('Neutrophil', '%'), ('Lymphocyte', '%'),
    ('Eosinophil', '%'), ('Monocyte', '%'), ('Basophil', '%'),
    ('BUN', 'mg/dL'), ('Creatinine', 'mg/dL'), ('eGFR', 'mL/min/1.73m2'),
    ('Fasting Blood Sugar', 'mg/dL'), ('Hb A1C', '%'),
    ('Cholesterol', 'mg/dL'), ('Triglyceride', 'mg/dL'),
    ('HDL-Cholesterol', 'mg/dL'), ('LDL-Cholesterol', 'mg/dL'),
    ('AST', 'U/L'), ('ALT', 'U/L'), ('Alkaline Phosphatase', 'U/L'),
    ('Total Bilirubin', 'mg/dL'), ('Albumin', 'g/dL'),
    ('Sodium', 'mmol/L'), ('Potassium', 'mmol/L'), ('Chloride', 'mmol/L'),
    ('Bicarbonate', 'mmol/L'), ('TSH', 'mIU/L'), ('Free T4', 'ng/dL'),
    ('Urine WBC', '/HPF'), ('Urine RBC', '/HPF'), ('Urine Epithelium', '/HPF')
) AS v(nm, uom)
WHERE imed.medhack_orderlab.itemname = v.nm
  AND (imed.medhack_orderlab.itemuom IS NULL OR btrim(imed.medhack_orderlab.itemuom) = '');

-- 8. visit end time: the original extract recorded when each OPD visit began
--    but not when it ended. Close each one a plausible consultation later,
--    derived from its own start time so the value is stable across runs.
UPDATE imed.medhack_bedmanagement
SET enddatetime = to_char(startdatetime::timestamp
                          + make_interval(mins => 35 + (abs(hashtext(transactionnumber)) % 150)),
                          'YYYY-MM-DD HH24:MI:SS')
WHERE enddatetime IS NULL AND startdatetime IS NOT NULL;

-- 9. lab structural rows on the original 21 visits. "Comment" carries the
--    lab's free-text note; "Attach File" carries the scanned report's file
--    reference. Neither has a unit, which is why itemuom stays NULL.
UPDATE imed.medhack_orderlab
SET itemvalue = 'รายงานผลโดยเจ้าหน้าที่ห้องปฏิบัติการ ตรวจสอบแล้ว'
WHERE itemname = 'Comment' AND (itemvalue IS NULL OR btrim(itemvalue) = '');
UPDATE imed.medhack_orderlab
SET itemvalue = replace(panelname, ' ', '_') || '_' || substr(transactionnumber, 4, 8) || '.pdf'
WHERE itemname = 'Attach File' AND (itemvalue IS NULL OR btrim(itemvalue) = '');

-- 10. procedure window: two of the seed procedures never carried one.
UPDATE imed.medhack_procedure_icd9
SET startdatetime = to_char(to_timestamp(substr(transactionnumber, 4, 12), 'YYMMDDHH24MISS')
                            + interval '55 minutes', 'YYYY-MM-DD HH24:MI:SS'),
    enddatetime   = to_char(to_timestamp(substr(transactionnumber, 4, 12), 'YYMMDDHH24MISS')
                            + interval '95 minutes', 'YYYY-MM-DD HH24:MI:SS')
WHERE startdatetime IS NULL AND transactionnumber ~ '^...[0-9]{12}';
"""


if __name__ == "__main__":
    main()
