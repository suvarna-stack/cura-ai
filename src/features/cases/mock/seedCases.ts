import type { ApiCaseDetail, ApiCasesResponse } from '../types/api.types'

export const SEED_CASES = {
  "stats": {
    "total": 5,
    "complete": 3,
    "incomplete": 1,
    "finished": 2
  },
  "complete": [
    {
      "id": "86826041006143381201",
      "patient": "Kritsada Kittikhun",
      "vn": "86826041006143381201",
      "hn": null,
      "dept": "—",
      "ward": null,
      "group": "Cardiovascular",
      "confidence": 80,
      "severity": "medium",
      "coverage": null,
      "coverageLabel": null,
      "coverageFamily": null,
      "encountertype": "0",
      "ccpi": "ติดตามอาการ 3 เดือน",
      "cc": "ติดตามอาการ 3 เดือน",
      "pi": "Case Gout, Old CVA, BPH อาการดี ไม่มีปวดตามข้อ ไม่มีอ่อนแรง มีเวียนหัวบางครั้ง Old CVA Dx CRH MRI 2/2025: Non-specific w",
      "codes": [
        {
          "code": "I69.3",
          "system": "ICD-10",
          "role": "principal_diagnosis",
          "desc": "Sequelae of cerebral infarction"
        },
        {
          "code": "M10.99",
          "system": "ICD-10",
          "role": "secondary_diagnosis",
          "desc": "Gout"
        }
      ],
      "orders": {
        "lab": 23,
        "medicine": 2,
        "other": 15
      },
      "orderNames": {
        "lab": [
          "BUN",
          "Electrolyte",
          "Creatinine",
          "Glucose (Fasting)",
          "Lipid profile"
        ],
        "medicine": [
          "AtorvaSTATin TAB 40 MG",
          "CLOPIDOGREL BISULFATE TAB 75 MG"
        ],
        "other": [
          "BUN",
          "Electrolyte",
          "Creatinine",
          "Glucose (Fasting)",
          "Lipid profile",
          "ค่าบริการผู้ป่วยนอก (ในเวลา)",
          "ค่าบริการสถานพยาบาล-Hospital Charge (ในเวลา)"
        ]
      },
      "created_at": "2026-03-08T04:18:00+07:00",
      "updated_at": "2026-03-09T07:18:00+07:00",
      "revenue_impact": "high",
      "coders": []
    },
    {
      "id": "86826041006165662201",
      "patient": "Pongsak Suwannarat",
      "vn": "86826041006165662201",
      "hn": null,
      "dept": "—",
      "ward": null,
      "group": "Cardiovascular",
      "confidence": 79,
      "severity": "medium",
      "coverage": null,
      "coverageLabel": null,
      "coverageFamily": null,
      "encountertype": "0",
      "ccpi": "ติดตามอาการ1เดือน",
      "cc": "ติดตามอาการ1เดือน",
      "pi": "Case Stroke มีอาการอ่อนแรงซีกซ้าย ขาซ้ายมีแรงเดินลำพังได้ แต่ยังมีเซมีอ่อนแรงอยู่เล็กน้อย ไม่มีล้ม ยังมีลิ้นแข็งพูดลำบาก",
      "codes": [
        {
          "code": "I69.3",
          "system": "ICD-10",
          "role": "principal_diagnosis",
          "desc": "Sequelae of cerebral infarction"
        },
        {
          "code": "I10",
          "system": "ICD-10",
          "role": "secondary_diagnosis",
          "desc": "Essential HT"
        },
        {
          "code": "E78.9",
          "system": "ICD-10",
          "role": "secondary_diagnosis",
          "desc": "DLP (Dyslipidemia)"
        }
      ],
      "orders": {
        "lab": 14,
        "medicine": 4,
        "other": 9
      },
      "orderNames": {
        "lab": [
          "BUN",
          "Creatinine",
          "Electrolyte"
        ],
        "medicine": [
          "ASPIRIN TAB 81 MG",
          "AtorvaSTATin TAB 40 MG",
          "LOSARTAN POTASSIUM TAB 50 MG",
          "OMEPRAZOLE EC CAP 20 MG"
        ],
        "other": [
          "BUN",
          "Creatinine",
          "Electrolyte",
          "ค่าบริการผู้ป่วยนอก (ในเวลา)"
        ]
      },
      "created_at": "2025-09-29T09:15:00+07:00",
      "updated_at": "2025-10-02T20:15:00+07:00",
      "revenue_impact": "high",
      "coders": []
    },
    {
      "id": "86826041006173971901",
      "patient": "Waraporn Pongpan",
      "vn": "86826041006173971901",
      "hn": null,
      "dept": "—",
      "ward": null,
      "group": "Infectious",
      "confidence": 79,
      "severity": "medium",
      "coverage": "OFC_O5",
      "coverageLabel": "OFC",
      "coverageFamily": "OFC",
      "encountertype": "0",
      "ccpi": "ติดตามอาการ3เดือน",
      "cc": "ติดตามอาการ3เดือน",
      "pi": "# Panic d/o f/u psychi # DLP # White coat HT # Chronic HBV infection - no fHx of HCC, บิดาเป็นตับแข็ง - เคย on antiviral",
      "codes": [
        {
          "code": "B18.1",
          "system": "ICD-10",
          "role": "principal_diagnosis",
          "desc": "chronic HBV infection"
        },
        {
          "code": "E78.9",
          "system": "ICD-10",
          "role": "secondary_diagnosis",
          "desc": "DLP (Dyslipidemia)"
        }
      ],
      "orders": {
        "lab": 87,
        "medicine": 2,
        "other": 55
      },
      "orderNames": {
        "lab": [
          "CBC",
          "Creatinine",
          "Glucose (Fasting)",
          "Lipid profile",
          "Liver function test",
          "การตรวจเซลล์วิทยา - liquid base",
          "[ชำระเงินเอง] HPV DNA 14 high risk types"
        ],
        "medicine": [
          "TENOFOVIR ALAFENAMIDE TAB 25 MG [MYTAFF]",
          "SIMVASTATIN TAB 20 MG"
        ],
        "other": [
          "การตรวจเซลล์วิทยา - liquid base",
          "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "CBC",
          "Creatinine",
          "Glucose (Fasting)",
          "Lipid profile",
          "Liver function test",
          "ค่าบริการผู้ป่วยนอก (ในเวลา)",
          "ค่าบริการสถานพยาบาล-Hospital Charge (ในเวลา)",
          "การตรวจภายใน"
        ]
      },
      "created_at": "2026-03-22T00:27:00+07:00",
      "updated_at": "2026-03-25T05:27:00+07:00",
      "revenue_impact": "high",
      "coders": []
    }
  ],
  "incompleteGroups": [
    {
      "id": "ungrouped",
      "label": "Ungrouped Group",
      "total": 2,
      "cases": [
        {
          "id": "86826041008545561001",
          "patient": "Ratree Chaiyasit",
          "vn": "86826041008545561001",
          "hn": null,
          "dept": "—",
          "ward": null,
          "group": "Ungrouped",
          "confidence": 87,
          "severity": "low",
          "coverage": null,
          "coverageLabel": null,
          "coverageFamily": null,
          "encountertype": "0",
          "ccpi": "มาตามนัดฉีดวัคซีนไวรัสตับอักเสบบีเข็มที่ 2",
          "cc": "มาตามนัดฉีดวัคซีนไวรัสตับอักเสบบีเข็มที่ 2",
          "pi": "",
          "codes": [],
          "orders": {
            "medicine": 1,
            "other": 7
          },
          "orderNames": {
            "medicine": [
              "HEPATITIS B VACCINE INJ (1 ML)"
            ],
            "other": [
              "Alcohol pad",
              "เข็ม(Needle)#27x1\"",
              "เข็ม(Needle)#18x1 1/2\"",
              "Cotton Ball Sterile 0.35 gm (PAC5)",
              "รายละเอียดชุดเหมา",
              "[Package] วัคซีนป้องกันไวรัสตับอักเสบบี (Hepatitis B Vaccine",
              "การฉีดยาเข้ากล้ามเนื้อ/IM (ผู้ป่วยนอกและฉุกเฉิน)"
            ]
          },
          "created_at": "2026-05-22T15:16:00+07:00",
          "updated_at": "2026-05-23T17:16:00+07:00",
          "revenue_impact": "medium",
          "coders": [],
          "missing": "Physical examination / objective note, Assessment / progression note, Principal diagnosis (ICD-10)"
        },
        {
          "id": "86826041008552698901",
          "patient": "Kessara Bunmee",
          "vn": "86826041008552698901",
          "hn": null,
          "dept": "—",
          "ward": null,
          "group": "Ungrouped",
          "confidence": 94,
          "severity": "low",
          "coverage": null,
          "coverageLabel": null,
          "coverageFamily": null,
          "encountertype": "0",
          "ccpi": "มาตามนัด",
          "cc": "มาตามนัด",
          "pi": "",
          "codes": [],
          "orders": {
            "medicine": 1,
            "other": 7
          },
          "orderNames": {
            "medicine": [
              "HEPATITIS B VACCINE INJ (1 ML)"
            ],
            "other": [
              "Alcohol pad",
              "เข็ม(Needle)#18x1 1/2\"",
              "Cotton Ball Sterile 0.35 gm (PAC5)",
              "การฉีดยาเข้ากล้ามเนื้อ/IM (ผู้ป่วยนอกและฉุกเฉิน)",
              "เข็ม(Needle)#27x1\"",
              "รายละเอียดชุดเหมา",
              "[Package] วัคซีนป้องกันไวรัสตับอักเสบบี (Hepatitis B Vaccine"
            ]
          },
          "created_at": "2026-05-30T21:57:00+07:00",
          "updated_at": "2026-06-03T06:57:00+07:00",
          "revenue_impact": "medium",
          "coders": [],
          "missing": "Physical examination / objective note, Assessment / progression note, Principal diagnosis (ICD-10)"
        }
      ]
    }
  ],
  "finished": [
    {
      "id": "86826041005200378701",
      "patient": "Supaporn Tancharoen",
      "vn": "86826041005200378701",
      "hn": null,
      "dept": "—",
      "ward": null,
      "group": "Cardiovascular",
      "severity": "medium",
      "coverage": "OFC_O3",
      "coverageLabel": "OFC",
      "coverageFamily": "OFC",
      "encountertype": "0",
      "codes": [
        {
          "code": "I10",
          "system": "ICD-10",
          "role": "principal_diagnosis",
          "desc": "Essential HT"
        },
        {
          "code": "I10",
          "system": "ICD-10",
          "role": "principal_diagnosis",
          "desc": "Essential HT"
        },
        {
          "code": "E78.9",
          "system": "ICD-10",
          "role": "secondary_diagnosis",
          "desc": "DLP (Dyslipidemia)"
        }
      ],
      "orders": {
        "lab": 65,
        "medicine": 4,
        "other": 33
      },
      "orderNames": {
        "lab": [
          "CBC",
          "Creatinine",
          "Glucose (Fasting)",
          "Lipid profile",
          "Liver function test"
        ],
        "medicine": [
          "LORazepam TAB 0.5 MG",
          "ORPHENADRINE CITRATE + ACETAMINOPHEN TAB 35 + 450 MG",
          "LOSARTAN POTASSIUM TAB 100 MG",
          "ROSUVASTATIN TAB 20 MG"
        ],
        "other": [
          "CBC",
          "Creatinine",
          "Glucose (Fasting)",
          "Lipid profile",
          "Liver function test",
          "ค่าบริการสถานพยาบาล-Hospital Charge (ในเวลา)",
          "ค่าบริการผู้ป่วยนอก (ในเวลา)"
        ]
      },
      "created_at": "2025-09-01T15:53:00+07:00",
      "updated_at": "2025-09-04T19:53:00+07:00",
      "revenue_impact": "high",
      "coders": [
        "Teerapat S."
      ],
      "codedDate": "2026-07-08",
      "coder": "Teerapat S.",
      "coderId": "demo.coder",
      "drg": "—",
      "reopenable": true
    },
    {
      "id": "86826041005244411101",
      "patient": "Chaiwat Saengthong",
      "vn": "86826041005244411101",
      "hn": null,
      "dept": "—",
      "ward": null,
      "group": "Orthopedic",
      "severity": "low",
      "coverage": "WEL_88_I",
      "coverageLabel": "WEL",
      "coverageFamily": "WEL",
      "encountertype": "0",
      "codes": [
        {
          "code": "M10.99",
          "system": "ICD-10",
          "role": "principal_diagnosis",
          "desc": "Gout"
        },
        {
          "code": "M10.99",
          "system": "ICD-10",
          "role": "principal_diagnosis",
          "desc": "Gout"
        },
        {
          "code": "E87.6",
          "system": "ICD-10",
          "role": "other",
          "desc": "Hypokalemia"
        },
        {
          "code": "Z95.2",
          "system": "ICD-10",
          "role": "other",
          "desc": "s/p AVR"
        },
        {
          "code": "I10",
          "system": "ICD-10",
          "role": "other",
          "desc": "Essential HT"
        },
        {
          "code": "E78.9",
          "system": "ICD-10",
          "role": "other",
          "desc": "DLP (Dyslipidemia)"
        }
      ],
      "orders": {
        "lab": 39,
        "medicine": 10,
        "other": 20
      },
      "orderNames": {
        "lab": [
          "PT (INR)",
          "BUN",
          "Hb A1C",
          "Microalbumin, Urine",
          "Creatinine",
          "Electrolyte",
          "Creatinine, Urine",
          "Glucose (Fasting)",
          "Uric acid",
          "Lipid profile"
        ],
        "medicine": [
          "ALLOPURINOL TAB 100 MG",
          "AtorvaSTATin TAB 40 MG",
          "COLCHICINE TAB 0.6 MG",
          "LOSARTAN POTASSIUM TAB 50 MG",
          "MANIDIPINE TAB 20 MG",
          "POTASSIUM CHLORIDE ELIXIR 20 mEq/15 ML (60 ML)",
          "WARFARIN TAB 2 MG [HAD]",
          "LACTULOSE SYR 66.7% (100 ML)",
          "MeToproLoL TARTRATE TAB 100 MG"
        ],
        "other": [
          "PT (INR)",
          "Hb A1C",
          "Microalbumin, Urine",
          "BUN",
          "Electrolyte",
          "Creatinine",
          "Creatinine, Urine",
          "Glucose (Fasting)",
          "Uric acid",
          "Lipid profile",
          "ค่าบริการผู้ป่วยนอก (ในเวลา)"
        ]
      },
      "created_at": "2026-03-06T22:44:00+07:00",
      "updated_at": "2026-03-08T04:44:00+07:00",
      "revenue_impact": "medium",
      "coders": [
        "Sarah K."
      ],
      "codedDate": "2026-07-08",
      "coder": "Sarah K.",
      "coderId": "demo.coder",
      "drg": "—",
      "reopenable": true
    }
  ]
} as unknown as ApiCasesResponse

export const SEED_CASE_DETAILS: Record<string, ApiCaseDetail> = {
  "86826041006143381201": {
    "case": {
      "case_id": "86826041006143381201",
      "patient_ref": null,
      "encountertype": "0",
      "sex": "male",
      "birthdate": "1966-12-01",
      "ageyear": "59,4,9",
      "admissiondatetime": null,
      "dischargedatetime": null,
      "dischargetype": null,
      "dischargestatus": null,
      "ispregnant": null,
      "ward": null,
      "department": null,
      "coverage_type": null,
      "completeness_status": "complete",
      "missing_detail": null,
      "disease_group": "Cardiovascular",
      "severity_level": "medium",
      "case_status": "open",
      "fetched_at": "2026-07-08 15:24:45",
      "attending_physician": null
    },
    "coverage": null,
    "sections": [
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Skin: no rash",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Extremities: no arthritis, no edema",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Neurological: E4V5M6, normotonia, motor power gr. 5 all extremity",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Gastrointestinal: no distension soft, no tenderness no mass active bowel sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Cardiovascular: normal s1s2, no murmur",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Respiratory: equal breath sound with no adventitious sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "HEENT: not pale conjunctiva, anicteric sclera",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "General Appearance: good consciousness with orientation to time place and person",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "NAPROXEN",
        "recorddatetime": "2022-03-09 10:37:16"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "SULFA",
        "recorddatetime": "2022-03-09 10:38:51"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "TOLPERISONE:AMITRIPTYLINE",
        "recorddatetime": "2022-12-15 15:32:02"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Family History",
        "value": "HT",
        "recorddatetime": "2023-07-20 10:50:09"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Chief Complaint",
        "value": "ติดตามอาการ 3 เดือน",
        "recorddatetime": "2026-04-10 10:04:15"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Present Illness",
        "value": "Case Gout, Old CVA, BPH \nอาการดี ไม่มีปวดตามข้อ ไม่มีอ่อนแรง\nมีเวียนหัวบางครั้ง\n\nOld CVA Dx CRH\nMRI 2/2025: Non-specific white matter hyperintensities, possible small vessel disease",
        "recorddatetime": "2026-04-10 10:04:15"
      }
    ],
    "codes": [
      {
        "code": "M10.99",
        "code_system": "ICD-10",
        "description": "Gout",
        "code_role": "secondary_diagnosis",
        "source": "imported_from_imed"
      },
      {
        "code": "I69.3",
        "code_system": "ICD-10",
        "description": "Sequelae of cerebral infarction",
        "code_role": "principal_diagnosis",
        "source": "imported_from_imed"
      }
    ],
    "orders": [
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "BUN",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "BUN",
          "paneltmlt": "320052",
          "panelcgd": "32201",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320052",
          "itemcgd": "32201",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "BUN",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "BUN",
          "paneltmlt": "320052",
          "panelcgd": "32201",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320052",
          "itemcgd": "32201",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "BUN",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "BUN",
          "paneltmlt": "320052",
          "panelcgd": "32201",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320052",
          "itemcgd": "32201",
          "itemname": "BUN",
          "itemvalue": "14",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Anion Gap",
          "itemvalue": "8"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "TCO2",
          "itemvalue": "26",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Cl",
          "itemvalue": "107",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "K+(Potassium)",
          "itemvalue": "3.8",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Na (Sodium)",
          "itemvalue": "141",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "eGFR for Thai",
          "itemvalue": "77",
          "itemuom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Creatinine",
          "itemvalue": "1.05",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Glucose (Fasting)",
          "itemvalue": "80",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "LDL (calculated)",
          "itemvalue": "88",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "HDL",
          "itemvalue": "57",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Triglyceride",
          "itemvalue": "93",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 09:08:46",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:06",
          "reportdatetime": "2026-04-10 09:08:46",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Cholesterol",
          "itemvalue": "163",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "AtorvaSTATin TAB 40 MG",
        "ordered_at": "2026-04-10 10:33:06",
        "detail": {
          "name": "AtorvaSTATin TAB 40 MG",
          "tmt": "1044587",
          "dosagesignature": "oral 1 tab once daily hs",
          "dosageinstruction": "วันละ 1 ครั้ง ก่อนนอน",
          "quantity": "90",
          "remark": "เพื่อลดระดับไขมันในเลือดและป้องกันโรคหลอดเลือดอุดตัน",
          "receiveddatetime": "2026-04-10 10:33:06"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "CLOPIDOGREL BISULFATE TAB 75 MG",
        "ordered_at": "2026-04-10 10:33:06",
        "detail": {
          "name": "CLOPIDOGREL BISULFATE TAB 75 MG",
          "tmt": "1140422",
          "dosagesignature": "oral 1 tab once daily pc am",
          "dosageinstruction": "วันละ 1 ครั้ง หลังอาหาร เช้า",
          "quantity": "90",
          "remark": "รักษาหรือป้องกันภาวะลิ่มเลือดอุดตัน",
          "receiveddatetime": "2026-04-10 10:33:06"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "BUN",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320052",
          "cgd": "32201",
          "name": "BUN",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "BUN",
          "value": "14",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Anion Gap",
          "value": "8"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "TCO2",
          "value": "26",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Cl",
          "value": "107",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "K+(Potassium)",
          "value": "3.8",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Na (Sodium)",
          "value": "141",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "eGFR for Thai",
          "value": "77",
          "uom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Creatinine",
          "value": "1.05",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Glucose (Fasting)",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320291",
          "cgd": "32203",
          "name": "Glucose (Fasting)",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Glucose (Fasting)",
          "value": "80",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "LDL (calculated)",
          "value": "88",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HDL",
          "value": "57",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Triglyceride",
          "value": "93",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Cholesterol",
          "value": "163",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
        "ordered_at": "2026-04-10 06:14:33",
        "detail": {
          "name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
          "cgd": "55020",
          "feeschedule": "55020",
          "quantity": "1",
          "verifydatetime": "2026-04-10 06:14:33"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "ค่าบริการสถานพยาบาล-Hospital Charge (ในเวลา)",
        "ordered_at": "2026-04-10 06:14:33",
        "detail": {
          "name": "ค่าบริการสถานพยาบาล-Hospital Charge (ในเวลา)",
          "quantity": "1",
          "verifydatetime": "2026-04-10 06:14:33"
        }
      }
    ],
    "orderCounts": {
      "lab": 23,
      "medicine": 2,
      "other": 15
    },
    "history": []
  },
  "86826041006165662201": {
    "case": {
      "case_id": "86826041006165662201",
      "patient_ref": null,
      "encountertype": "0",
      "sex": "male",
      "birthdate": "1940-10-05",
      "ageyear": "85,6,5",
      "admissiondatetime": null,
      "dischargedatetime": null,
      "dischargetype": null,
      "dischargestatus": null,
      "ispregnant": null,
      "ward": null,
      "department": null,
      "coverage_type": null,
      "completeness_status": "complete",
      "missing_detail": null,
      "disease_group": "Cardiovascular",
      "severity_level": "medium",
      "case_status": "open",
      "fetched_at": "2026-07-08 15:24:45",
      "attending_physician": null
    },
    "coverage": null,
    "sections": [
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Skin: no rash",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Extremities: no arthritis, no edema",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Neurological: E4V5M6, normotonia, motor power gr. 5 all extremity",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Gastrointestinal: no distension soft, no tenderness no mass active bowel sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Cardiovascular: normal s1s2, no murmur",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Respiratory: equal breath sound with no adventitious sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "HEENT: not pale conjunctiva, anicteric sclera",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "General Appearance: good consciousness with orientation to time place and person",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "แพ้อาหารทะเลทุกชนิด",
        "recorddatetime": "2026-02-21 00:57:54"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "ทะเล มีผื่นคัน",
        "recorddatetime": "2026-04-10 08:27:21"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Chief Complaint",
        "value": "ติดตามอาการ1เดือน",
        "recorddatetime": "2026-04-10 10:07:29"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Present Illness",
        "value": "Case Stroke มีอาการอ่อนแรงซีกซ้าย ขาซ้ายมีแรงเดินลำพังได้ แต่ยังมีเซมีอ่อนแรงอยู่เล็กน้อย ไม่มีล้ม ยังมีลิ้นแข็งพูดลำบากอยู่บ้าง ไม่มีสำลักอาหาร แต่สำลักน้ำอยู่\n\nLast admit 21/2/69\n# Minor stroke: Small vessel disease\nNIHSS 3\nAn ill-defined hypodense lesion at right corona radiata, possible acute infarction. - Small degree of small vessel disease. - Several hypodense lesions at bilateral external capsules and left thalamus, probably old lacunar infarction\n\nHomeBP 130-140",
        "recorddatetime": "2026-04-10 10:07:29"
      }
    ],
    "codes": [
      {
        "code": "I10",
        "code_system": "ICD-10",
        "description": "Essential HT",
        "code_role": "secondary_diagnosis",
        "source": "imported_from_imed"
      },
      {
        "code": "E78.9",
        "code_system": "ICD-10",
        "description": "DLP (Dyslipidemia)",
        "code_role": "secondary_diagnosis",
        "source": "imported_from_imed"
      },
      {
        "code": "I69.3",
        "code_system": "ICD-10",
        "description": "Sequelae of cerebral infarction",
        "code_role": "principal_diagnosis",
        "source": "imported_from_imed"
      }
    ],
    "orders": [
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "BUN",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "BUN",
          "paneltmlt": "320052",
          "panelcgd": "32201",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320052",
          "itemcgd": "32201",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "BUN",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "BUN",
          "paneltmlt": "320052",
          "panelcgd": "32201",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320052",
          "itemcgd": "32201",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "BUN",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "BUN",
          "paneltmlt": "320052",
          "panelcgd": "32201",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320052",
          "itemcgd": "32201",
          "itemname": "BUN",
          "itemvalue": "16",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "eGFR for Thai",
          "itemvalue": "62",
          "itemuom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Creatinine",
          "itemvalue": "1.08",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Anion Gap",
          "itemvalue": "10"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "TCO2",
          "itemvalue": "24",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Cl",
          "itemvalue": "94",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "K+(Potassium)",
          "itemvalue": "4.9",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:27:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:28:56",
          "reportdatetime": "2026-04-10 08:27:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Na (Sodium)",
          "itemvalue": "128",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "ASPIRIN TAB 81 MG",
        "ordered_at": "2026-04-10 15:36:48",
        "detail": {
          "name": "ASPIRIN TAB 81 MG",
          "tmt": "768484",
          "dosagesignature": "oral 1 tab once daily pci am",
          "dosageinstruction": "วันละ 1 ครั้ง หลังอาหารทันที เช้า",
          "quantity": "90",
          "remark": "เพื่อรักษาหรือป้องกันโรคหลอดเลือดอุดตัน",
          "receiveddatetime": "2026-04-10 15:36:48"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "AtorvaSTATin TAB 40 MG",
        "ordered_at": "2026-04-10 15:36:48",
        "detail": {
          "name": "AtorvaSTATin TAB 40 MG",
          "tmt": "1044587",
          "dosagesignature": "oral 1 tab once daily hs",
          "dosageinstruction": "วันละ 1 ครั้ง ก่อนนอน",
          "quantity": "90",
          "remark": "เพื่อลดระดับไขมันในเลือดและป้องกันโรคหลอดเลือดอุดตัน",
          "receiveddatetime": "2026-04-10 15:36:48"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "LOSARTAN POTASSIUM TAB 50 MG",
        "ordered_at": "2026-04-10 15:36:48",
        "detail": {
          "name": "LOSARTAN POTASSIUM TAB 50 MG",
          "tmt": "114112",
          "dosagesignature": "oral 1 tab once daily pc am",
          "dosageinstruction": "วันละ 1 ครั้ง หลังอาหาร เช้า",
          "quantity": "90",
          "remark": "เพื่อรักษาโรคความดันโลหิตสูงหรือภาวะหัวใจล้มเหลว",
          "receiveddatetime": "2026-04-10 15:36:48"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "OMEPRAZOLE EC CAP 20 MG",
        "ordered_at": "2026-04-10 15:36:48",
        "detail": {
          "name": "OMEPRAZOLE EC CAP 20 MG",
          "tmt": "104721",
          "dosagesignature": "oral 1 cap once daily ac1 am",
          "dosageinstruction": "วันละ 1 ครั้ง ก่อนอาหาร 1 ชั่วโมง เช้า",
          "quantity": "90",
          "remark": "รักษาแผลในกระเพาะ ลดการหลั่งกรด กรดไหลย้อน",
          "receiveddatetime": "2026-04-10 15:36:48"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "BUN",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320052",
          "cgd": "32201",
          "name": "BUN",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "BUN",
          "value": "16",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "eGFR for Thai",
          "value": "62",
          "uom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Creatinine",
          "value": "1.08",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Anion Gap",
          "value": "10"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "TCO2",
          "value": "24",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Cl",
          "value": "94",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "K+(Potassium)",
          "value": "4.9",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Na (Sodium)",
          "value": "128",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
        "ordered_at": "2026-04-10 06:16:56",
        "detail": {
          "name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
          "cgd": "55020",
          "feeschedule": "55020",
          "quantity": "1",
          "verifydatetime": "2026-04-10 06:16:56"
        }
      }
    ],
    "orderCounts": {
      "lab": 14,
      "medicine": 4,
      "other": 9
    },
    "history": []
  },
  "86826041006173971901": {
    "case": {
      "case_id": "86826041006173971901",
      "patient_ref": null,
      "encountertype": "0",
      "sex": "female",
      "birthdate": "1959-12-16",
      "ageyear": "66,3,25",
      "admissiondatetime": null,
      "dischargedatetime": null,
      "dischargetype": null,
      "dischargestatus": null,
      "ispregnant": null,
      "ward": null,
      "department": null,
      "coverage_type": "OFC_O5",
      "completeness_status": "complete",
      "missing_detail": null,
      "disease_group": "Infectious",
      "severity_level": "medium",
      "case_status": "open",
      "fetched_at": "2026-07-08 15:24:45",
      "attending_physician": null
    },
    "coverage": {
      "coverage_code": "OFC_O5",
      "scheme_family": "OFC",
      "label_th": null,
      "label_en": null,
      "payer": "CGD"
    },
    "sections": [
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Skin: no rash",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Extremities: no arthritis, no edema",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Neurological: E4V5M6, normotonia, motor power gr. 5 all extremity",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Gastrointestinal: no distension soft, no tenderness no mass active bowel sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Cardiovascular: normal s1s2, no murmur",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Respiratory: equal breath sound with no adventitious sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "HEENT: not pale conjunctiva, anicteric sclera",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "General Appearance: good consciousness with orientation to time place and person",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "CDS: No bulging",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Adnexa: No mass, not tender",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Uterus: Normal size, A/V, firm, not tender",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Cervix: No lesion",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Vagina: Normal discharge, normal mucosa",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "NIUB/MIUB: Normal",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "ASPIRIN",
        "recorddatetime": "2021-07-15 09:59:51"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "dipyridamone",
        "recorddatetime": "2021-07-15 10:00:50"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "PREGABALIN",
        "recorddatetime": "2025-07-07 09:05:28"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "ปูนา",
        "recorddatetime": "2025-11-13 08:07:12"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Family History",
        "value": "ไม่มีประวัติความเจ็บป่วยในครอบครัว",
        "recorddatetime": "2026-02-09 08:24:41"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "ปู",
        "recorddatetime": "2026-04-07 07:41:58"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Chief Complaint",
        "value": "ติดตามอาการ3เดือน",
        "recorddatetime": "2026-04-10 09:02:13"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Present Illness",
        "value": "# Panic d/o f/u psychi\n# DLP\n# White coat HT\n# Chronic HBV infection\n- no fHx of HCC, บิดาเป็นตับแข็ง\n- เคย on antiviral เชียงใหม่ แล้วหยุดไป\n- HBV DNA VL (27/11/67): 43 IU/mL\n- Fibroscan 7/4/69 : CAP159 4.3kPa (F0-1)\n- U/S upper abdomen (7/11/68): Liver parenchymal disease without focal space taking lesion.\n\n16/1/69 -- APRI score: 0.9 --> risk sig. fibrosis ---> plan start TAF \n- modified Score PAGE-B : 14 --> Risk group : High (5-year HCC risk : 18.4%)\n-----> plan U/S + AFP q 6 mo.\n\n4 เดือน เริ่มมีอาการปวดอืดท้องหลังอาหาร ไม่ได้เป็นทุกวัน \nถ้ามีอาการจะกินยา PPI\n--> ได้ prokinetics, simethicone --> อาการลดลงเหลือเดือนละ 2 ครั้ง",
        "recorddatetime": "2026-04-10 10:16:24"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Chief Complaint",
        "value": "มาตรวจคัดกรองมะเร็งปากมดลูก",
        "recorddatetime": "2026-04-10 10:45:43"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Present Illness",
        "value": "มาตรวจคัดกรองมะเร็งปากมดลูก\nืno leukorrhea, no AUB\nno hormonal used \nlast Pap smear 4 yrs.\nMenopause 16 yrs.",
        "recorddatetime": "2026-04-10 10:45:43"
      }
    ],
    "codes": [
      {
        "code": "B18.1",
        "code_system": "ICD-10",
        "description": "chronic HBV infection",
        "code_role": "principal_diagnosis",
        "source": "imported_from_imed"
      },
      {
        "code": "E78.9",
        "code_system": "ICD-10",
        "description": "DLP (Dyslipidemia)",
        "code_role": "secondary_diagnosis",
        "source": "imported_from_imed"
      }
    ],
    "orders": [
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "การตรวจเซลล์วิทยา - liquid base",
        "ordered_at": "2026-04-22 15:27:39",
        "detail": {
          "panelname": "การตรวจเซลล์วิทยา - liquid base",
          "reportdatetime": "2026-04-22 15:27:39",
          "itemname": "Liquid base"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "การตรวจเซลล์วิทยา - liquid base",
        "ordered_at": "2026-04-22 15:27:39",
        "detail": {
          "panelname": "การตรวจเซลล์วิทยา - liquid base",
          "reportdatetime": "2026-04-22 15:27:39",
          "itemname": "Comment",
          "itemvalue": "Status critical : No"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "การตรวจเซลล์วิทยา - liquid base",
        "ordered_at": "2026-04-22 15:27:39",
        "detail": {
          "panelname": "การตรวจเซลล์วิทยา - liquid base",
          "reportdatetime": "2026-04-22 15:27:39",
          "itemname": "Attach File",
          "itemvalue": "Please See PDF File."
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "Remark:"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 68",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 66",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 59",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 58",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 56",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 52",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 51",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 45",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 39",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 35",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 33",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 31",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 18",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "HPV genotype 16",
          "itemvalue": "Not detected"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "Assay reagent:",
          "itemvalue": "Allpex HPV HR Detection"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "Specimen:",
          "itemvalue": "Cervical specimens collected in preservCyto  solution"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": "2026-04-29 15:55:48",
        "detail": {
          "panelname": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "paneltmlt": "381243",
          "panelcgd": "-",
          "reportdatetime": "2026-04-29 15:55:48",
          "itemtmlt": "381243",
          "itemcgd": "-",
          "itemname": "Method:",
          "itemvalue": "Real Time RT-PCR"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Corrected White Cell Count"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Atypical lymphocyte",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Band Form",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Hypersegmented Neutrophil",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "NRBC",
          "itemuom": "/100 WBC"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Blast Cell",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Myeloblast",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Promyelocyte",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Myelocyte",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Metamyelocyte",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Macrocyte"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Poikilocytosis"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Burr cell"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Hypochromia"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Ovalocyte"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Polychromasia",
          "itemuom": "cells/OPF"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Schistocyte"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Spherocyte"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Target Cell"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Tear drop cell",
          "itemuom": "cells/OPF"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Other 1"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Other 2"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "RDW",
          "itemvalue": "14.8",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Microcyte",
          "itemvalue": "Few"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Anisocytosis",
          "itemvalue": "Few"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "RBC Morphology",
          "itemvalue": "Abnormal RBC morphology"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Basophil",
          "itemvalue": "0.2",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Eosinophil",
          "itemvalue": "1.2",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Monocyte",
          "itemvalue": "6.6",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Lymphocyte",
          "itemvalue": "20.2",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Neutrophil",
          "itemvalue": "71.8",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Platelets Count",
          "itemvalue": "210000",
          "itemuom": "cells/cu.mm"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Platelet Smear",
          "itemvalue": "Adequate"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "MCHC",
          "itemvalue": "33",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "MCH",
          "itemvalue": "25",
          "itemuom": "pg"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "MCV",
          "itemvalue": "77",
          "itemuom": "fl"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Hct",
          "itemvalue": "43.2",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Hb",
          "itemvalue": "14.1",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Red Cell Count",
          "itemvalue": "5.6",
          "itemuom": "10^6/uL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:29:47",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:29:47",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "White Cell Count",
          "itemvalue": "5640",
          "itemuom": "cells/cu.mm"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "eGFR for Thai",
          "itemvalue": "71",
          "itemuom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Creatinine",
          "itemvalue": "0.86",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Glucose (Fasting)",
          "itemvalue": "93",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "LDL (calculated)",
          "itemvalue": "73",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "HDL",
          "itemvalue": "54",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Triglyceride",
          "itemvalue": "94",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Cholesterol",
          "itemvalue": "145",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "ALP (Alkaline Phos)",
          "itemvalue": "62",
          "itemuom": "U/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "ALT (SGPT)",
          "itemvalue": "10",
          "itemuom": "U/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "AST (SGOT)",
          "itemvalue": "31",
          "itemuom": "U/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Bilirubin (Direct)",
          "itemvalue": "0.3",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Bilirubin (Total)",
          "itemvalue": "0.7",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Globulin",
          "itemvalue": "3.6",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Albumin.",
          "itemvalue": "4.4",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:52:42",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 07:41:52",
          "reportdatetime": "2026-04-10 08:52:42",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Total Protein",
          "itemvalue": "8.0",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "TENOFOVIR ALAFENAMIDE TAB 25 MG [MYTAFF]",
        "ordered_at": "2026-04-10 11:01:59",
        "detail": {
          "name": "TENOFOVIR ALAFENAMIDE TAB 25 MG [MYTAFF]",
          "tmt": "1134560",
          "dosagesignature": "oral 1 tab once daily am",
          "dosageinstruction": "วันละ 1 ครั้ง เช้า",
          "quantity": "100",
          "receiveddatetime": "2026-04-10 11:01:59"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "SIMVASTATIN TAB 20 MG",
        "ordered_at": "2026-04-10 11:01:59",
        "detail": {
          "name": "SIMVASTATIN TAB 20 MG",
          "tmt": "117625",
          "dosagesignature": "oral 1 tab once daily hs",
          "dosageinstruction": "วันละ 1 ครั้ง ก่อนนอน",
          "quantity": "90",
          "remark": "เพื่อลดไขมันในเลือดและป้องกันโรคหลอดเลือดอุดตัน",
          "receiveddatetime": "2026-04-10 11:01:59"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "การตรวจเซลล์วิทยา - liquid base",
        "ordered_at": " ",
        "detail": {
          "name": "การตรวจเซลล์วิทยา - liquid base",
          "documenttype": "Pathology Report",
          "fieldname": "Specimen",
          "subfieldname": "Comment",
          "value": "Status critical : No"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "การตรวจเซลล์วิทยา - liquid base",
        "ordered_at": " ",
        "detail": {
          "name": "การตรวจเซลล์วิทยา - liquid base",
          "documenttype": "Pathology Report",
          "fieldname": "Specimen",
          "subfieldname": "Attach File",
          "value": "Please See PDF File."
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 68",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 66",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 59",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 58",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 56",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 52",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 51",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 45",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 39",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 35",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 33",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 31",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 18",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HPV genotype 16",
          "value": "Not detected"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Assay reagent:",
          "value": "Allpex HPV HR Detection"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Specimen:",
          "value": "Cervical specimens collected in preservCyto  solution"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
        "ordered_at": " ",
        "detail": {
          "tmlt": "381243",
          "cgd": "-",
          "name": "[ชำระเงินเอง] HPV DNA 14 high risk types",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Method:",
          "value": "Real Time RT-PCR"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "RDW",
          "value": "14.8",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Microcyte",
          "value": "Few"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Anisocytosis",
          "value": "Few"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "RBC Morphology",
          "value": "Abnormal RBC morphology"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Basophil",
          "value": "0.2",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Eosinophil",
          "value": "1.2",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Monocyte",
          "value": "6.6",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Lymphocyte",
          "value": "20.2",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Neutrophil",
          "value": "71.8",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Platelets Count",
          "value": "210000",
          "uom": "cells/cu.mm"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Platelet Smear",
          "value": "Adequate"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "MCHC",
          "value": "33",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "MCH",
          "value": "25",
          "uom": "pg"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "MCV",
          "value": "77",
          "uom": "fl"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Hct",
          "value": "43.2",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Hb",
          "value": "14.1",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Red Cell Count",
          "value": "5.6",
          "uom": "10^6/uL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "White Cell Count",
          "value": "5640",
          "uom": "cells/cu.mm"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "eGFR for Thai",
          "value": "71",
          "uom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Creatinine",
          "value": "0.86",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Glucose (Fasting)",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320291",
          "cgd": "32203",
          "name": "Glucose (Fasting)",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Glucose (Fasting)",
          "value": "93",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "LDL (calculated)",
          "value": "73",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HDL",
          "value": "54",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Triglyceride",
          "value": "94",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Cholesterol",
          "value": "145",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "ALP (Alkaline Phos)",
          "value": "62",
          "uom": "U/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "ALT (SGPT)",
          "value": "10",
          "uom": "U/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "AST (SGOT)",
          "value": "31",
          "uom": "U/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Bilirubin (Direct)",
          "value": "0.3",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Bilirubin (Total)",
          "value": "0.7",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Globulin",
          "value": "3.6",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Albumin.",
          "value": "4.4",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Total Protein",
          "value": "8.0",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "การตรวจภายใน",
        "ordered_at": "2026-04-10 08:32:26",
        "detail": {
          "name": "การตรวจภายใน",
          "cgd": "55620",
          "feeschedule": "55620",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:32:26"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
        "ordered_at": "2026-04-10 06:17:39",
        "detail": {
          "name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
          "cgd": "55020",
          "feeschedule": "55020",
          "quantity": "1",
          "verifydatetime": "2026-04-10 06:17:39"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "ค่าบริการสถานพยาบาล-Hospital Charge (ในเวลา)",
        "ordered_at": "2026-04-10 06:17:39",
        "detail": {
          "name": "ค่าบริการสถานพยาบาล-Hospital Charge (ในเวลา)",
          "quantity": "1",
          "verifydatetime": "2026-04-10 06:17:39"
        }
      }
    ],
    "orderCounts": {
      "lab": 87,
      "medicine": 2,
      "other": 55
    },
    "history": []
  },
  "86826041008545561001": {
    "case": {
      "case_id": "86826041008545561001",
      "patient_ref": null,
      "encountertype": "0",
      "sex": "female",
      "birthdate": "2006-06-18",
      "ageyear": "19,9,23",
      "admissiondatetime": null,
      "dischargedatetime": null,
      "dischargetype": null,
      "dischargestatus": null,
      "ispregnant": null,
      "ward": null,
      "department": null,
      "coverage_type": null,
      "completeness_status": "incomplete",
      "missing_detail": "exam,assessment,primary_diagnosis",
      "disease_group": "Ungrouped",
      "severity_level": "low",
      "case_status": "open",
      "fetched_at": "2026-07-08 15:24:45",
      "attending_physician": null
    },
    "coverage": null,
    "sections": [
      {
        "documenttype": "OPD Record",
        "fieldname": "Chief Complaint",
        "value": "มาตามนัดฉีดวัคซีนไวรัสตับอักเสบบีเข็มที่ 2 ",
        "recorddatetime": "2026-04-10 08:57:10"
      }
    ],
    "codes": [],
    "orders": [
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "HEPATITIS B VACCINE INJ (1 ML)",
        "ordered_at": "2026-04-10 09:08:24",
        "detail": {
          "name": "HEPATITIS B VACCINE INJ (1 ML)",
          "tmt": "673014",
          "dosagesignature": "im 1 via",
          "quantity": "1",
          "receiveddatetime": "2026-04-10 09:08:24"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "Alcohol pad",
        "ordered_at": "2026-04-10 08:56:42",
        "detail": {
          "name": "Alcohol pad",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:56:42"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "เข็ม(Needle)#27x1\"",
        "ordered_at": "2026-04-10 08:56:42",
        "detail": {
          "name": "เข็ม(Needle)#27x1\"",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:56:42"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "เข็ม(Needle)#18x1 1/2\"",
        "ordered_at": "2026-04-10 08:56:42",
        "detail": {
          "name": "เข็ม(Needle)#18x1 1/2\"",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:56:42"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "Cotton Ball Sterile 0.35 gm (PAC5)",
        "ordered_at": "2026-04-10 08:56:42",
        "detail": {
          "name": "Cotton Ball Sterile 0.35 gm (PAC5)",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:56:42"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "การฉีดยาเข้ากล้ามเนื้อ/IM (ผู้ป่วยนอกและฉุกเฉิน)",
        "ordered_at": "2026-04-10 08:56:43",
        "detail": {
          "name": "การฉีดยาเข้ากล้ามเนื้อ/IM (ผู้ป่วยนอกและฉุกเฉิน)",
          "cgd": "55823",
          "feeschedule": "55823",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:56:43"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "รายละเอียดชุดเหมา",
        "ordered_at": "2026-04-10 08:56:42",
        "detail": {
          "name": "รายละเอียดชุดเหมา",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:56:42"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "[Package] วัคซีนป้องกันไวรัสตับอักเสบบี (Hepatitis B Vaccine)-[สำหรับผู้ใหญ่] จำนวน 1 เข็ม",
        "ordered_at": "2026-04-10 08:56:42",
        "detail": {
          "name": "[Package] วัคซีนป้องกันไวรัสตับอักเสบบี (Hepatitis B Vaccine)-[สำหรับผู้ใหญ่] จำนวน 1 เข็ม",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:56:42"
        }
      }
    ],
    "orderCounts": {
      "medicine": 1,
      "other": 7
    },
    "history": []
  },
  "86826041008552698901": {
    "case": {
      "case_id": "86826041008552698901",
      "patient_ref": null,
      "encountertype": "0",
      "sex": "female",
      "birthdate": "2006-01-10",
      "ageyear": "20,3,0",
      "admissiondatetime": null,
      "dischargedatetime": null,
      "dischargetype": null,
      "dischargestatus": null,
      "ispregnant": null,
      "ward": null,
      "department": null,
      "coverage_type": null,
      "completeness_status": "incomplete",
      "missing_detail": "exam,assessment,primary_diagnosis",
      "disease_group": "Ungrouped",
      "severity_level": "low",
      "case_status": "open",
      "fetched_at": "2026-07-08 15:24:45",
      "attending_physician": null
    },
    "coverage": null,
    "sections": [
      {
        "documenttype": "OPD Record",
        "fieldname": "Chief Complaint",
        "value": "มาตามนัด",
        "recorddatetime": "2026-04-10 08:56:54"
      }
    ],
    "codes": [],
    "orders": [
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "HEPATITIS B VACCINE INJ (1 ML)",
        "ordered_at": "2026-04-10 09:08:12",
        "detail": {
          "name": "HEPATITIS B VACCINE INJ (1 ML)",
          "tmt": "673014",
          "dosagesignature": "im 1 via",
          "quantity": "1",
          "receiveddatetime": "2026-04-10 09:08:12"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "Alcohol pad",
        "ordered_at": "2026-04-10 09:01:04",
        "detail": {
          "name": "Alcohol pad",
          "quantity": "1",
          "verifydatetime": "2026-04-10 09:01:04"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "เข็ม(Needle)#18x1 1/2\"",
        "ordered_at": "2026-04-10 09:01:04",
        "detail": {
          "name": "เข็ม(Needle)#18x1 1/2\"",
          "quantity": "1",
          "verifydatetime": "2026-04-10 09:01:04"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "Cotton Ball Sterile 0.35 gm (PAC5)",
        "ordered_at": "2026-04-10 09:01:04",
        "detail": {
          "name": "Cotton Ball Sterile 0.35 gm (PAC5)",
          "quantity": "1",
          "verifydatetime": "2026-04-10 09:01:04"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "การฉีดยาเข้ากล้ามเนื้อ/IM (ผู้ป่วยนอกและฉุกเฉิน)",
        "ordered_at": "2026-04-10 09:01:04",
        "detail": {
          "name": "การฉีดยาเข้ากล้ามเนื้อ/IM (ผู้ป่วยนอกและฉุกเฉิน)",
          "cgd": "55823",
          "feeschedule": "55823",
          "quantity": "1",
          "verifydatetime": "2026-04-10 09:01:04"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "เข็ม(Needle)#27x1\"",
        "ordered_at": "2026-04-10 09:01:04",
        "detail": {
          "name": "เข็ม(Needle)#27x1\"",
          "quantity": "1",
          "verifydatetime": "2026-04-10 09:01:04"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "รายละเอียดชุดเหมา",
        "ordered_at": "2026-04-10 09:01:04",
        "detail": {
          "name": "รายละเอียดชุดเหมา",
          "quantity": "1",
          "verifydatetime": "2026-04-10 09:01:04"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "[Package] วัคซีนป้องกันไวรัสตับอักเสบบี (Hepatitis B Vaccine)-[สำหรับผู้ใหญ่] จำนวน 1 เข็ม",
        "ordered_at": "2026-04-10 09:01:04",
        "detail": {
          "name": "[Package] วัคซีนป้องกันไวรัสตับอักเสบบี (Hepatitis B Vaccine)-[สำหรับผู้ใหญ่] จำนวน 1 เข็ม",
          "quantity": "1",
          "verifydatetime": "2026-04-10 09:01:04"
        }
      }
    ],
    "orderCounts": {
      "medicine": 1,
      "other": 7
    },
    "history": []
  },
  "86826041005200378701": {
    "case": {
      "case_id": "86826041005200378701",
      "patient_ref": null,
      "encountertype": "0",
      "sex": "female",
      "birthdate": "1959-11-22",
      "ageyear": "66,4,19",
      "admissiondatetime": null,
      "dischargedatetime": null,
      "dischargetype": null,
      "dischargestatus": null,
      "ispregnant": null,
      "ward": null,
      "department": null,
      "coverage_type": "OFC_O3",
      "completeness_status": "complete",
      "missing_detail": null,
      "disease_group": "Cardiovascular",
      "severity_level": "medium",
      "case_status": "approved",
      "fetched_at": "2026-07-08 15:24:45",
      "attending_physician": null
    },
    "coverage": {
      "coverage_code": "OFC_O3",
      "scheme_family": "OFC",
      "label_th": null,
      "label_en": null,
      "payer": "CGD"
    },
    "sections": [
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Skin: no rash",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Extremities: no arthritis, no edema",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Neurological: E4V5M6, normotonia, motor power gr. 5 all extremity",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Gastrointestinal: no distension soft, no tenderness no mass active bowel sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Cardiovascular: normal s1s2, no murmur",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Respiratory: equal breath sound with no adventitious sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "HEENT: not pale conjunctiva, anicteric sclera",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "General Appearance: good consciousness with orientation to time place and person",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Food-Drug Allergy",
        "value": "PENICILLIN",
        "recorddatetime": "2022-07-18 22:42:51"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Family History",
        "value": "เส้นเลือดสมองตีบ",
        "recorddatetime": "2023-08-07 08:00:52"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Family History",
        "value": "้HT",
        "recorddatetime": "2023-08-07 08:00:52"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Chief Complaint",
        "value": "มาตรวจติดตามอาการตามนัด 3 เดือน ",
        "recorddatetime": "2026-04-10 09:42:38"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Present Illness",
        "value": "\t#HT\n#DLP\n\nThis visit\nอาการทั่วไปปกติ ไม่มีปวดศีรษะ/เวียนศีรษะ ไม่มีใจสั่น ไม่มีหน้ามืด\nHMBP 120-130\nไม่ได้ทาน atorvastatin\n\nmx - add atorvastatin\n\n16/6/68 - LDL 85 >> RM\n30/6/68 - off amlodipine + start madiplot เนื่องจากคนไข้บอกว่าทานแล้วบวม\nCPK WNL\n5/1/68 - start rosuvastatin, off madiplot เนื่องจากบวม\nup dose losartan\n\n10/4/69 - RM ",
        "recorddatetime": "2026-04-10 09:42:38"
      }
    ],
    "codes": [
      {
        "code": "E78.9",
        "code_system": "ICD-10",
        "description": "DLP (Dyslipidemia)",
        "code_role": "secondary_diagnosis",
        "source": "imported_from_imed"
      },
      {
        "code": "I10",
        "code_system": "ICD-10",
        "description": "Essential HT",
        "code_role": "principal_diagnosis",
        "source": "imported_from_imed"
      },
      {
        "code": "I10",
        "code_system": "ICD-10",
        "description": "Essential HT",
        "code_role": "principal_diagnosis",
        "source": "coder_assigned"
      }
    ],
    "orders": [
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Corrected White Cell Count"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Atypical lymphocyte",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Band Form",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Hypersegmented Neutrophil",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "NRBC",
          "itemuom": "/100 WBC"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Blast Cell",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Myeloblast",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Promyelocyte",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Myelocyte",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Metamyelocyte",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Anisocytosis"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Microcyte"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Macrocyte"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Poikilocytosis"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Burr cell"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Hypochromia"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Ovalocyte"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Polychromasia",
          "itemuom": "cells/OPF"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Schistocyte"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Spherocyte"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Target Cell"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Tear drop cell",
          "itemuom": "cells/OPF"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Other 1"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Other 2"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "RDW",
          "itemvalue": "13.0",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "RBC Morphology",
          "itemvalue": "Normochromic Normocytic RBC"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Basophil",
          "itemvalue": "0.5",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Eosinophil",
          "itemvalue": "1.9",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Monocyte",
          "itemvalue": "7.3",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Lymphocyte",
          "itemvalue": "37.7",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Neutrophil",
          "itemvalue": "52.6",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Platelets Count",
          "itemvalue": "271000",
          "itemuom": "cells/cu.mm"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Platelet Smear",
          "itemvalue": "Adequate"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "MCHC",
          "itemvalue": "33",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "MCH",
          "itemvalue": "31",
          "itemuom": "pg"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "MCV",
          "itemvalue": "94",
          "itemuom": "fl"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Hct",
          "itemvalue": "42.4",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Hb",
          "itemvalue": "13.9",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "Red Cell Count",
          "itemvalue": "4.5",
          "itemuom": "10^6/uL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "CBC",
        "ordered_at": "2026-04-10 08:17:17",
        "detail": {
          "panelname": "CBC",
          "paneltmlt": "300034",
          "panelcgd": "30101",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:17:17",
          "itemtmlt": "300034",
          "itemcgd": "30101",
          "itemname": "White Cell Count",
          "itemvalue": "6760",
          "itemuom": "cells/cu.mm"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "eGFR for Thai",
          "itemvalue": "100",
          "itemuom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Creatinine",
          "itemvalue": "0.52",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Glucose (Fasting)",
          "itemvalue": "101",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "LDL (calculated)",
          "itemvalue": "Unable to report because Triglyceride > 400",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "HDL",
          "itemvalue": "32",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Triglyceride",
          "itemvalue": "401",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Cholesterol",
          "itemvalue": "221",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "ALP (Alkaline Phos)",
          "itemvalue": "102",
          "itemuom": "U/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "ALT (SGPT)",
          "itemvalue": "12",
          "itemuom": "U/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "AST (SGOT)",
          "itemvalue": "20",
          "itemuom": "U/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Bilirubin (Direct)",
          "itemvalue": "0.3",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Bilirubin (Total)",
          "itemvalue": "0.6",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Globulin",
          "itemvalue": "3.5",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Albumin.",
          "itemvalue": "4.5",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Liver function test",
        "ordered_at": "2026-04-10 08:29:34",
        "detail": {
          "panelname": "Liver function test",
          "paneltmlt": "320261",
          "panelcgd": "32003",
          "collectdatetime": "2026-04-10 06:59:45",
          "reportdatetime": "2026-04-10 08:29:34",
          "itemtmlt": "320261",
          "itemcgd": "32003",
          "itemname": "Total Protein",
          "itemvalue": "8.0",
          "itemuom": "g/dL"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "LORazepam TAB 0.5 MG",
        "ordered_at": "2026-04-10 10:06:07",
        "detail": {
          "name": "LORazepam TAB 0.5 MG",
          "tmt": "462294",
          "dosagesignature": "oral 1 tab once daily hs",
          "dosageinstruction": "วันละ 1 ครั้ง ก่อนนอน",
          "quantity": "30",
          "remark": "ใช้ลดอาการวิตกกังวลและช่วยให้นอนหลับ",
          "receiveddatetime": "2026-04-10 10:06:07"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "ORPHENADRINE CITRATE + ACETAMINOPHEN TAB 35 + 450 MG",
        "ordered_at": "2026-04-10 10:06:07",
        "detail": {
          "name": "ORPHENADRINE CITRATE + ACETAMINOPHEN TAB 35 + 450 MG",
          "tmt": "461136",
          "dosagesignature": "oral 1 tab tid pc",
          "dosageinstruction": "วันละ 3 ครั้ง หลังอาหาร เช้า กลางวัน เย็น",
          "quantity": "30",
          "remark": "สำหรับคลายกล้ามเนื้อ บรรเทาปวด",
          "receiveddatetime": "2026-04-10 10:06:07"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "LOSARTAN POTASSIUM TAB 100 MG",
        "ordered_at": "2026-04-10 10:06:07",
        "detail": {
          "name": "LOSARTAN POTASSIUM TAB 100 MG",
          "tmt": "114165",
          "dosagesignature": "oral 1 tab once daily pc am",
          "dosageinstruction": "วันละ 1 ครั้ง หลังอาหาร เช้า",
          "quantity": "100",
          "remark": "เพื่อรักษาโรคความดันโลหิตสูงหรือภาวะหัวใจล้มเหลว",
          "receiveddatetime": "2026-04-10 10:06:07"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "ROSUVASTATIN TAB 20 MG",
        "ordered_at": "2026-04-10 10:06:07",
        "detail": {
          "name": "ROSUVASTATIN TAB 20 MG",
          "tmt": "1026481",
          "dosagesignature": "oral 1 tab once daily hs",
          "dosageinstruction": "วันละ 1 ครั้ง ก่อนนอน",
          "quantity": "100",
          "remark": "เพื่อลดระดับไขมันในเลือดและป้องกันโรคหลอดเลือดอุดตัน",
          "receiveddatetime": "2026-04-10 10:06:07"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "RDW",
          "value": "13.0",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "RBC Morphology",
          "value": "Normochromic Normocytic RBC"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Basophil",
          "value": "0.5",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Eosinophil",
          "value": "1.9",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Monocyte",
          "value": "7.3",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Lymphocyte",
          "value": "37.7",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Neutrophil",
          "value": "52.6",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Platelets Count",
          "value": "271000",
          "uom": "cells/cu.mm"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Platelet Smear",
          "value": "Adequate"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "MCHC",
          "value": "33",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "MCH",
          "value": "31",
          "uom": "pg"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "MCV",
          "value": "94",
          "uom": "fl"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Hct",
          "value": "42.4",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Hb",
          "value": "13.9",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Red Cell Count",
          "value": "4.5",
          "uom": "10^6/uL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "CBC",
        "ordered_at": " ",
        "detail": {
          "tmlt": "300034",
          "cgd": "30101",
          "name": "CBC",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "White Cell Count",
          "value": "6760",
          "uom": "cells/cu.mm"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "eGFR for Thai",
          "value": "100",
          "uom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Creatinine",
          "value": "0.52",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Glucose (Fasting)",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320291",
          "cgd": "32203",
          "name": "Glucose (Fasting)",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Glucose (Fasting)",
          "value": "101",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "LDL (calculated)",
          "value": "Unable to report because Triglyceride > 400",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HDL",
          "value": "32",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Triglyceride",
          "value": "401",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Cholesterol",
          "value": "221",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "ALP (Alkaline Phos)",
          "value": "102",
          "uom": "U/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "ALT (SGPT)",
          "value": "12",
          "uom": "U/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "AST (SGOT)",
          "value": "20",
          "uom": "U/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Bilirubin (Direct)",
          "value": "0.3",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Bilirubin (Total)",
          "value": "0.6",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Globulin",
          "value": "3.5",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Albumin.",
          "value": "4.5",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Liver function test",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320261",
          "cgd": "32003",
          "name": "Liver function test",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Total Protein",
          "value": "8.0",
          "uom": "g/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
        "ordered_at": "2026-04-10 08:21:39",
        "detail": {
          "name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
          "cgd": "55020",
          "feeschedule": "55020",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:21:39"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "ค่าบริการสถานพยาบาล-Hospital Charge (ในเวลา)",
        "ordered_at": "2026-04-10 08:21:36",
        "detail": {
          "name": "ค่าบริการสถานพยาบาล-Hospital Charge (ในเวลา)",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:21:36"
        }
      }
    ],
    "orderCounts": {
      "lab": 65,
      "medicine": 4,
      "other": 33
    },
    "history": [
      {
        "action": "code_assigned",
        "coder": "Teerapat S.",
        "at": "2026-07-08 15:24:55",
        "detail": {
          "simulated": true
        }
      },
      {
        "action": "approved_single",
        "coder": "Teerapat S.",
        "at": "2026-07-08 15:24:55",
        "detail": {}
      }
    ]
  },
  "86826041005244411101": {
    "case": {
      "case_id": "86826041005244411101",
      "patient_ref": null,
      "encountertype": "0",
      "sex": "male",
      "birthdate": "1961-07-03",
      "ageyear": "64,9,7",
      "admissiondatetime": null,
      "dischargedatetime": null,
      "dischargetype": null,
      "dischargestatus": null,
      "ispregnant": null,
      "ward": null,
      "department": null,
      "coverage_type": "WEL_88_I",
      "completeness_status": "complete",
      "missing_detail": null,
      "disease_group": "Orthopedic",
      "severity_level": "low",
      "case_status": "approved",
      "fetched_at": "2026-07-08 15:24:45",
      "attending_physician": null
    },
    "coverage": {
      "coverage_code": "WEL_88_I",
      "scheme_family": "WEL",
      "label_th": null,
      "label_en": null,
      "payer": "NHSO"
    },
    "sections": [
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Skin: no rash",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Extremities: no arthritis, no edema",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Neurological: E4V5M6, normotonia, motor power gr. 5 all extremity",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Gastrointestinal: no distension soft, no tenderness no mass active bowel sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Cardiovascular: normal s1s2, no murmur",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "Respiratory: equal breath sound with no adventitious sound",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "HEENT: not pale conjunctiva, anicteric sclera",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Physical Examination",
        "value": "General Appearance: good consciousness with orientation to time place and person",
        "recorddatetime": null
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Family History",
        "value": "ไม่ทราบ",
        "recorddatetime": "2021-12-29 09:28:01"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Chief Complaint",
        "value": "นัดติดตามอาการ 3 เดือน case case Gout, DLP, HT, s/p AVR",
        "recorddatetime": "2026-04-10 09:51:50"
      },
      {
        "documenttype": "OPD Record",
        "fieldname": "Present Illness",
        "value": "# Gout\nlast attack > 1 yr\nuric 6.8 > 5.7\n\n# HT\nHBPM 100-110/60-70\nhypoK 3.1 no Hx GI loss \n\n>> off HCTZ + observe HBPM\n\n# S/P AVR mechanical valve, MV repaired ปี'51 - on Warfarin\nEcho(10/1/65) : EF 66.3%\n>> Goal keep INR 2.5-3.5 <<\n\n14/1/69 INR 2.51 on WFR \n10/4/69 INR 3.73\n\ndec WFR 14 mg/wk (7%)\nF/U 2 mo \n\n# Hemorrhoid\nHx มีก้อนยื่นที่ทวารหนัก ไม่มีเลือดออก ไม่ปวด\nเวลานั่งนาน หรือเบ่งอุจจาระ\nถ่ายทุกวัน ไม่เบ่งนาน ไม่ถ่ายแข็ง\n\ntry diosmin clinical improve ไม่มีก้อนยื่นแล้ว \n> off diosmin + maintenance laxative",
        "recorddatetime": "2026-04-10 09:51:50"
      }
    ],
    "codes": [
      {
        "code": "M10.99",
        "code_system": "ICD-10",
        "description": "Gout",
        "code_role": "principal_diagnosis",
        "source": "imported_from_imed"
      },
      {
        "code": "E87.6",
        "code_system": "ICD-10",
        "description": "Hypokalemia",
        "code_role": "other",
        "source": "imported_from_imed"
      },
      {
        "code": "Z95.2",
        "code_system": "ICD-10",
        "description": "s/p AVR",
        "code_role": "other",
        "source": "imported_from_imed"
      },
      {
        "code": "I10",
        "code_system": "ICD-10",
        "description": "Essential HT",
        "code_role": "other",
        "source": "imported_from_imed"
      },
      {
        "code": "E78.9",
        "code_system": "ICD-10",
        "description": "DLP (Dyslipidemia)",
        "code_role": "other",
        "source": "imported_from_imed"
      },
      {
        "code": "M10.99",
        "code_system": "ICD-10",
        "description": "Gout",
        "code_role": "principal_diagnosis",
        "source": "coder_assigned"
      }
    ],
    "orders": [
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "PT (INR)",
        "ordered_at": "2026-04-10 08:20:58",
        "detail": {
          "panelname": "PT (INR)",
          "paneltmlt": "308039",
          "panelcgd": "30201",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:20:58",
          "itemtmlt": "308039",
          "itemcgd": "30201",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "PT (INR)",
        "ordered_at": "2026-04-10 08:20:58",
        "detail": {
          "panelname": "PT (INR)",
          "paneltmlt": "308039",
          "panelcgd": "30201",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:20:58",
          "itemtmlt": "308039",
          "itemcgd": "30201",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "PT (INR)",
        "ordered_at": "2026-04-10 08:20:58",
        "detail": {
          "panelname": "PT (INR)",
          "paneltmlt": "308039",
          "panelcgd": "30201",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:20:58",
          "itemtmlt": "308039",
          "itemcgd": "30201",
          "itemname": "INR",
          "itemvalue": "3.73"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "PT (INR)",
        "ordered_at": "2026-04-10 08:20:58",
        "detail": {
          "panelname": "PT (INR)",
          "paneltmlt": "308039",
          "panelcgd": "30201",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:20:58",
          "itemtmlt": "308039",
          "itemcgd": "30201",
          "itemname": "PT",
          "itemvalue": "39.4",
          "itemuom": "Second"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "BUN",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "BUN",
          "paneltmlt": "320052",
          "panelcgd": "32201",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320052",
          "itemcgd": "32201",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "BUN",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "BUN",
          "paneltmlt": "320052",
          "panelcgd": "32201",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320052",
          "itemcgd": "32201",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "BUN",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "BUN",
          "paneltmlt": "320052",
          "panelcgd": "32201",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320052",
          "itemcgd": "32201",
          "itemname": "BUN",
          "itemvalue": "14",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Hb A1C",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Hb A1C",
          "paneltmlt": "320131",
          "panelcgd": "32401",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320131",
          "itemcgd": "32401",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Hb A1C",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Hb A1C",
          "paneltmlt": "320131",
          "panelcgd": "32401",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320131",
          "itemcgd": "32401",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Hb A1C",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Hb A1C",
          "paneltmlt": "320131",
          "panelcgd": "32401",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320131",
          "itemcgd": "32401",
          "itemname": "HbA1C",
          "itemvalue": "5.8",
          "itemuom": "%"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Microalbumin, Urine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Microalbumin, Urine",
          "paneltmlt": "320269",
          "panelcgd": "34116",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320269",
          "itemcgd": "34116",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Microalbumin, Urine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Microalbumin, Urine",
          "paneltmlt": "320269",
          "panelcgd": "34116",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320269",
          "itemcgd": "34116",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Microalbumin, Urine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Microalbumin, Urine",
          "paneltmlt": "320269",
          "panelcgd": "34116",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320269",
          "itemcgd": "34116",
          "itemname": "Urine Microalbumin",
          "itemvalue": "4",
          "itemuom": "mg/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "eGFR for Thai",
          "itemvalue": "85",
          "itemuom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Creatinine",
          "paneltmlt": "320055",
          "panelcgd": "32202",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320055",
          "itemcgd": "32202",
          "itemname": "Creatinine",
          "itemvalue": "0.94",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Anion Gap",
          "itemvalue": "12"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "TCO2",
          "itemvalue": "21",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Cl",
          "itemvalue": "106",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "K+(Potassium)",
          "itemvalue": "3.1",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Electrolyte",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Electrolyte",
          "paneltmlt": "320258",
          "panelcgd": "32001",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320258",
          "itemcgd": "32001",
          "itemname": "Na (Sodium)",
          "itemvalue": "139",
          "itemuom": "mmol/L"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine, Urine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Creatinine, Urine",
          "paneltmlt": "320057",
          "panelcgd": "34101",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320057",
          "itemcgd": "34101",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine, Urine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Creatinine, Urine",
          "paneltmlt": "320057",
          "panelcgd": "34101",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320057",
          "itemcgd": "34101",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Creatinine, Urine",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Creatinine, Urine",
          "paneltmlt": "320057",
          "panelcgd": "34101",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320057",
          "itemcgd": "34101",
          "itemname": "Creatinine (Random Urine)",
          "itemvalue": "189",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Glucose (Fasting)",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Glucose (Fasting)",
          "paneltmlt": "320291",
          "panelcgd": "32203",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320291",
          "itemcgd": "32203",
          "itemname": "Glucose (Fasting)",
          "itemvalue": "90",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Uric acid",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Uric acid",
          "paneltmlt": "320080",
          "panelcgd": "32205",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320080",
          "itemcgd": "32205",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Uric acid",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Uric acid",
          "paneltmlt": "320080",
          "panelcgd": "32205",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320080",
          "itemcgd": "32205",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Uric acid",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Uric acid",
          "paneltmlt": "320080",
          "panelcgd": "32205",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320080",
          "itemcgd": "32205",
          "itemname": "Uric acid",
          "itemvalue": "6.0",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Comment"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Attach File"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "LDL (calculated)",
          "itemvalue": "71",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "HDL",
          "itemvalue": "41",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Triglyceride",
          "itemvalue": "117",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "lab",
        "imed_source": "MedHack_OrderLAB",
        "order_name": "Lipid profile ",
        "ordered_at": "2026-04-10 08:31:08",
        "detail": {
          "panelname": "Lipid profile ",
          "paneltmlt": "320259",
          "panelcgd": "32004",
          "collectdatetime": "2026-04-10 07:02:14",
          "reportdatetime": "2026-04-10 08:31:08",
          "itemtmlt": "320259",
          "itemcgd": "32004",
          "itemname": "Cholesterol",
          "itemvalue": "135",
          "itemuom": "mg/dL"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "ALLOPURINOL TAB 100 MG",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "ALLOPURINOL TAB 100 MG",
          "tmt": "235155",
          "dosagesignature": "oral 2 tab once daily pc am",
          "dosageinstruction": "วันละ 1 ครั้ง หลังอาหาร เช้า",
          "quantity": "120",
          "remark": "เพื่อลดกรดยูริกในเลือด",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "AtorvaSTATin TAB 40 MG",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "AtorvaSTATin TAB 40 MG",
          "tmt": "1044587",
          "dosagesignature": "oral 1 tab once daily hs",
          "dosageinstruction": "วันละ 1 ครั้ง ก่อนนอน",
          "quantity": "60",
          "remark": "เพื่อลดระดับไขมันในเลือดและป้องกันโรคหลอดเลือดอุดตัน",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "COLCHICINE TAB 0.6 MG",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "COLCHICINE TAB 0.6 MG",
          "tmt": "291862",
          "dosagesignature": "oral 1 tab bid pc",
          "dosageinstruction": "วันละ 2 ครั้ง หลังอาหาร เช้า เย็น",
          "quantity": "120",
          "remark": "เพื่อป้องกันและรักษาอาการปวดเฉียบพลันจากโรคเก๊าท์",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "LOSARTAN POTASSIUM TAB 50 MG",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "LOSARTAN POTASSIUM TAB 50 MG",
          "tmt": "114112",
          "dosagesignature": "oral 1 tab bid pc",
          "dosageinstruction": "วันละ 2 ครั้ง หลังอาหาร เช้า เย็น",
          "quantity": "120",
          "remark": "เพื่อรักษาโรคความดันโลหิตสูงหรือภาวะหัวใจล้มเหลว",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "MANIDIPINE TAB 20 MG",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "MANIDIPINE TAB 20 MG",
          "tmt": "109987",
          "dosagesignature": "oral 1 tab once daily pc pm",
          "dosageinstruction": "วันละ 1 ครั้ง หลังอาหาร เย็น",
          "quantity": "60",
          "remark": "เพื่อรักษาโรคความดันโลหิตสูง",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "MANIDIPINE TAB 20 MG",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "MANIDIPINE TAB 20 MG",
          "tmt": "1120914",
          "dosagesignature": "oral 1 tab once daily pc pm",
          "dosageinstruction": "วันละ 1 ครั้ง หลังอาหาร เย็น",
          "quantity": "60",
          "remark": "เพื่อรักษาโรคความดันโลหิตสูง",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "POTASSIUM CHLORIDE ELIXIR 20 mEq/15 ML (60 ML)",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "POTASSIUM CHLORIDE ELIXIR 20 mEq/15 ML (60 ML)",
          "tmt": "807578",
          "dosagesignature": "oral 30 ml bid af pm",
          "dosageinstruction": "วันละ 2 ครั้ง กลางวัน เย็น",
          "quantity": "1",
          "remark": "เสริมโพแทสเซียมสำหรับผู้ที่มีโพแทสเซียมในเลือดต่ำ",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "WARFARIN TAB 2 MG [HAD]",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "WARFARIN TAB 2 MG [HAD]",
          "tmt": "108128",
          "dosagesignature": "oral 1 tab once daily pc am",
          "dosageinstruction": "วันละ 1 ครั้ง หลังอาหาร เช้า",
          "quantity": "60",
          "remark": "ยาต้านการแข็งตัวของเลือด",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "LACTULOSE SYR 66.7% (100 ML)",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "LACTULOSE SYR 66.7% (100 ML)",
          "tmt": "618356",
          "dosagesignature": "oral 30 ml once daily hs",
          "dosageinstruction": "วันละ 1 ครั้ง ก่อนนอน",
          "quantity": "10",
          "remark": "แก้ท้องผูก รักษา/ป้องกันอาการทางสมองจากโรคตับ",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "medicine",
        "imed_source": "MedHack_OrderDrug",
        "order_name": "MeToproLoL TARTRATE TAB 100 MG",
        "ordered_at": "2026-04-10 10:32:14",
        "detail": {
          "name": "MeToproLoL TARTRATE TAB 100 MG",
          "tmt": "272891",
          "dosagesignature": "oral 1 tab once daily pc am",
          "dosageinstruction": "วันละ 1 ครั้ง หลังอาหาร เช้า",
          "quantity": "60",
          "remark": "เพื่อรักษาโรคความดันโลหิตสูงหรือภาวะหัวใจล้มเหลว",
          "receiveddatetime": "2026-04-10 10:32:14"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "PT (INR)",
        "ordered_at": " ",
        "detail": {
          "tmlt": "308039",
          "cgd": "30201",
          "name": "PT (INR)",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "INR",
          "value": "3.73"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "PT (INR)",
        "ordered_at": " ",
        "detail": {
          "tmlt": "308039",
          "cgd": "30201",
          "name": "PT (INR)",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "PT",
          "value": "39.4",
          "uom": "Second"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Hb A1C",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320131",
          "cgd": "32401",
          "name": "Hb A1C",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HbA1C",
          "value": "5.8",
          "uom": "%"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Microalbumin, Urine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320269",
          "cgd": "34116",
          "name": "Microalbumin, Urine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Urine Microalbumin",
          "value": "4",
          "uom": "mg/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "BUN",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320052",
          "cgd": "32201",
          "name": "BUN",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "BUN",
          "value": "14",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Anion Gap",
          "value": "12"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "TCO2",
          "value": "21",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Cl",
          "value": "106",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "K+(Potassium)",
          "value": "3.1",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Electrolyte",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320258",
          "cgd": "32001",
          "name": "Electrolyte",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Na (Sodium)",
          "value": "139",
          "uom": "mmol/L"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "eGFR for Thai",
          "value": "85",
          "uom": "mL/min/1.73 m^2"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320055",
          "cgd": "32202",
          "name": "Creatinine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Creatinine",
          "value": "0.94",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Creatinine, Urine",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320057",
          "cgd": "34101",
          "name": "Creatinine, Urine",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Creatinine (Random Urine)",
          "value": "189",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Glucose (Fasting)",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320291",
          "cgd": "32203",
          "name": "Glucose (Fasting)",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Glucose (Fasting)",
          "value": "90",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Uric acid",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320080",
          "cgd": "32205",
          "name": "Uric acid",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Uric acid",
          "value": "6.0",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "LDL (calculated)",
          "value": "71",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "HDL",
          "value": "41",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Triglyceride",
          "value": "117",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_MedicalRecord_result",
        "order_name": "Lipid profile ",
        "ordered_at": " ",
        "detail": {
          "tmlt": "320259",
          "cgd": "32004",
          "name": "Lipid profile ",
          "documenttype": "Diagnostic Report",
          "fieldname": "Specimen",
          "subfieldname": "Cholesterol",
          "value": "135",
          "uom": "mg/dL"
        }
      },
      {
        "order_category": "other",
        "imed_source": "MedHack_BillingItem",
        "order_name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
        "ordered_at": "2026-04-10 08:22:14",
        "detail": {
          "name": "ค่าบริการผู้ป่วยนอก (ในเวลา)",
          "cgd": "55020",
          "feeschedule": "55020",
          "quantity": "1",
          "verifydatetime": "2026-04-10 08:22:14"
        }
      }
    ],
    "orderCounts": {
      "lab": 39,
      "medicine": 10,
      "other": 20
    },
    "history": [
      {
        "action": "code_assigned",
        "coder": "Sarah K.",
        "at": "2026-07-08 15:24:55",
        "detail": {
          "simulated": true
        }
      },
      {
        "action": "approved_single",
        "coder": "Sarah K.",
        "at": "2026-07-08 15:24:55",
        "detail": {}
      }
    ]
  }
} as unknown as Record<string, ApiCaseDetail>
