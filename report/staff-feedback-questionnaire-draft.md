# Staff feedback questionnaire (draft — not administered, not part of the submitted report)

*Instrument for Ch.6/Ch.7's "feedback from medical staff" requirement. Not
yet administered — this is the design, ready to hand to pilot coders. Once
real responses come back, attach the raw (anonymized) results after this
file per the appendices-outline plan.*

## Why these items, not a from-scratch survey

Every item below is adapted from a validated instrument rather than invented,
so the results can be compared against published baselines instead of
standing alone:

- **Usability items** (Part 2) adapt the **System Usability Scale (SUS)** —
  the standard 10-item, 0–100 usability instrument (Brooke, 1986; scored by
  reversing negative items and scaling the sum by 2.5) — and the
  **Health-IT Usability Evaluation Scale (Health-ITUES)**, a 20-item
  instrument built specifically for clinical software across four domains
  (impact, perceived usefulness, ease of use, user control) rather than
  generic consumer software.
  [SUS scoring guide](https://trymata.com/blog/system-usability-scale-sus/) ·
  [Health-ITUES validation study](https://mhealth.jmir.org/2018/1/e4/) ·
  [Health-ITUES factor structure](https://academic.oup.com/jamia/article/21/e2/e241/703315)
- **Trust/reliance items** (Part 3, items 11–12) adapt the **Short Trust in
  Automation Scale (S-TIAS)** — a 3-item scale validated for AI-based
  clinical decision support that predicts whether a clinician will actually
  rely on a system's suggestions, not just say they like it.
  [S-TIAS validation](https://pmc.ncbi.nlm.nih.gov/articles/PMC12098057/) ·
  [Trust in AI-based CDS review](https://www.jmir.org/2025/1/e69678/PDF)
- **Coding-specific items** (accuracy perception, override frequency, the
  "who's responsible" and "did you notice the warning" checks in Part 5) are
  written for this system, since no published scale covers AI-assisted
  *medical coding* specifically — the literature on AI coding tools notes the
  field still "relies primarily on expert opinion and provider feedback via
  survey" rather than a standard instrument
  ([CDI/AI usability discussion](https://www.tandfonline.com/doi/full/10.1080/29947448.2025.2520761)),
  so a purpose-built set of items is the honest approach here.

Full items are kept short and the whole instrument targets **8–10 minutes**
to complete — long enough to be useful evidence, short enough that a coder
actually finishes it during a real pilot shift.

## PDPA note (see Ch.5 for full treatment)

This is a **staff/employee survey, not a patient-data collection** — but
Thailand's PDPA still applies to staff personal data. The design choices
below follow that:

- **No name field.** Role, experience band, and department are collected
  (needed to interpret results), but nothing that identifies an individual
  coder by name. With 2–4 coders on a pilot team this is a soft
  anonymity guarantee, not a strong one — say so plainly to respondents
  (see consent notice below) rather than overclaiming anonymity.
  [PDPA employee data obligations](https://securiti.ai/blog/employee-data-thailand/)
- **Consent is explicit and opt-in**, per PDPA's default lawful basis for
  data without another Section 24 exemption applying here (this isn't a
  contractual necessity or legal obligation) —
  [PDPA 2026 compliance guide](https://www.moore-gsia.com/pdpa-thailand/).
- **Purpose-limited**: state plainly the data is used only for this
  evaluation report, not performance review, and give a named contact and a
  deletion date.

---

## แบบสอบถามความคิดเห็นผู้ใช้งาน — ระบบ MedCode AI

**คำชี้แจงและขอความยินยอม (PDPA)**

แบบสอบถามนี้จัดทำขึ้นเพื่อประเมินระบบ MedCode AI ในโครงการ MediHack Extension
เท่านั้น **ไม่ใช่การประเมินผลการปฏิบัติงาน** ของท่าน คำตอบของท่านจะถูกใช้เพื่อ
จัดทำรายงานผลการทดสอบระบบเท่านั้น

- แบบสอบถามนี้ **ไม่เก็บชื่อ-นามสกุล** ของท่าน แต่เนื่องจากทีมนำร่องมีจำนวนจำกัด
  (2–4 คน) คำตอบของท่านอาจถูกคาดเดาได้จากบริบท คำตอบจึงมีความเป็นส่วนตัวใน
  ระดับหนึ่งเท่านั้น ไม่ใช่การไม่เปิดเผยตัวตนอย่างสมบูรณ์
- การตอบแบบสอบถามนี้เป็นไปโดย **สมัครใจ** ท่านสามารถข้ามคำถามใดก็ได้ หรือ
  หยุดตอบได้ตลอดเวลาโดยไม่มีผลกระทบใดๆ
- ข้อมูลจะถูกเก็บไว้เพื่อจัดทำรายงานฉบับนี้เท่านั้น และจะถูกลบภายใน
  **[ระบุวันที่ลบข้อมูล — ทีมงานต้องกำหนด]**
- ผู้รับผิดชอบข้อมูล / ติดต่อสอบถาม: **[ระบุชื่อและช่องทางติดต่อ — ทีมงานต้องกรอก]**

☐ ข้าพเจ้ายินยอมให้เก็บและใช้ข้อมูลตามที่ระบุข้างต้น

---

### ส่วนที่ 1 — ข้อมูลผู้ตอบแบบสอบถาม (ไม่ระบุตัวตน)

1. บทบาทของท่าน: ☐ ผู้ให้รหัสโรค (Coder) ☐ หัวหน้าฝ่ายให้รหัส ☐ เจ้าหน้าที่เวชระเบียน (HIM) ☐ อื่นๆ ระบุ ______
2. ประสบการณ์การให้รหัสโรค: ☐ น้อยกว่า 1 ปี ☐ 1–3 ปี ☐ 3–10 ปี ☐ มากกว่า 10 ปี
3. แผนกที่ท่านให้รหัสเป็นหลัก: ______________________
4. ความถี่ในการใช้ระบบ MedCode AI ระหว่างช่วงทดลอง: ☐ ทุกวัน ☐ หลายครั้งต่อสัปดาห์ ☐ ไม่กี่ครั้ง ☐ ใช้ครั้งเดียว

### ส่วนที่ 2 — การใช้งานระบบ (Usability)

*ตอบตามระดับความเห็นด้วย: 1 = ไม่เห็นด้วยอย่างยิ่ง ... 5 = เห็นด้วยอย่างยิ่ง*

| ข้อ | ข้อความ | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 5 | หน้าแดชบอร์ดของ MedCode AI ใช้งานง่าย เข้าใจได้ทันที | | | | | |
| 6 | ท่านต้องการความช่วยเหลือ/การฝึกอบรมเพิ่มเติมเพื่อใช้งานฟังก์ชันพื้นฐาน *(ข้อนี้คะแนนกลับด้าน)* | | | | | |
| 7 | การซิงค์ข้อมูลเคสจากระบบโรงพยาบาล (iMed) ทำได้ง่ายและตรงไปตรงมา | | | | | |
| 8 | รูปแบบการแสดงเวชระเบียน (มุมมองโรงพยาบาล/ตามลำดับเวลา) ช่วยให้ท่านหาข้อมูลที่ต้องใช้ให้รหัสได้ง่าย | | | | | |
| 9 | การตรวจสอบและอนุมัติรหัสรู้สึกมีประสิทธิภาพเมื่อเทียบกับขั้นตอนเดิมที่ท่านคุ้นเคย | | | | | |
| 10 | ท่านมั่นใจว่าเข้าใจว่าแต่ละหน้าจอต้องการให้ท่านทำอะไร | | | | | |
| 11 | ระบบมีความสม่ำเสมอ — หน้าจอและปุ่มต่างๆ ทำงานตามที่ท่านคาดไว้ | | | | | |
| 12 | หากนำ MedCode AI มาใช้งานจริงทั้งโรงพยาบาล ท่านจะรู้สึกสบายใจที่จะใช้งานทุกวัน | | | | | |

### ส่วนที่ 3 — คุณภาพคำแนะนำของ AI และความไว้วางใจ

| ข้อ | ข้อความ | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 13 | รหัส ICD-10/ICD-9 ที่ AI แนะนำ ส่วนใหญ่เกี่ยวข้องกับเคสจริง | | | | | |
| 14 | ท่านสามารถสังเกตได้เมื่อคำแนะนำของ AI น่าจะผิด | | | | | |
| 15 | ท่านไว้วางใจ AI มากพอที่จะพิจารณาคำแนะนำก่อนเริ่มให้รหัสเอง | | | | | |
| 16 | ท่านจะพึ่งพาคำแนะนำของ AI นี้ในการตัดสินใจให้รหัสครั้งต่อๆ ไป *(โดยเข้าใจว่า AI เป็นเพียงผู้แนะนำ ท่านคือผู้อนุมัติขั้นสุดท้าย)* | | | | | |
| 17 | คำตอบจาก AI ผู้ช่วย (แชท) สอดคล้องกับสิ่งที่ท่านรู้จากเอกสารอ้างอิงการให้รหัสที่เป็นทางการ | | | | | |

18. ท่านเลือก/อนุมัติรหัสที่ AI แนะนำ **โดยไม่แก้ไข** บ่อยแค่ไหน?
    ☐ ไม่เคย ☐ นานๆ ครั้ง ☐ บางครั้ง ☐ บ่อย ☐ เกือบทุกครั้ง

19. ท่าน **ปฏิเสธหรือแก้ไข** รหัสที่ AI แนะนำเพราะเห็นว่าผิด บ่อยแค่ไหน?
    ☐ ไม่เคย ☐ นานๆ ครั้ง ☐ บางครั้ง ☐ บ่อย ☐ เกือบทุกครั้ง

### ส่วนที่ 4 — ผลกระทบต่อเวลาและขั้นตอนการทำงาน

*(คำตอบในส่วนนี้เป็นการประมาณด้วยความรู้สึกของผู้ตอบ ไม่ใช่ผลจากการจับเวลาจริง —
รายงานฉบับนี้จะระบุข้อจำกัดนี้ไว้ชัดเจน ไม่นำไปปนกับตัวเลขจากการทดสอบประสิทธิภาพ)*

20. เมื่อเทียบกับขั้นตอนการให้รหัสแบบเดิม (manual) การใช้ MedCode AI รู้สึก:
    ☐ ช้าลงมาก ☐ ช้าลง ☐ พอๆ กัน ☐ เร็วขึ้น ☐ เร็วขึ้นมาก

21. เวลาโดยประมาณที่ใช้ให้รหัส 1 เคสทั่วไป **โดยใช้ MedCode AI**: ______ นาที

22. เวลาโดยประมาณที่ใช้ให้รหัส 1 เคสทั่วไป **ด้วยขั้นตอนเดิม (manual)**: ______ นาที

23. สิ่งที่กินเวลามากที่สุดเมื่อใช้ MedCode AI คือ (เช่น รอ AI แนะนำรหัส, ตรวจสอบรหัสซ้ำ, สลับหน้าจอไปมา ฯลฯ):
    _________________________________________________

### ส่วนที่ 5 — ความปลอดภัยและความรับผิดชอบ

| ข้อ | ข้อความ | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 24 | ท่านเข้าใจตลอดเวลาว่า **ท่าน ไม่ใช่ AI** คือผู้รับผิดชอบรหัสสุดท้ายก่อนอนุมัติ | | | | | |
| 25 | ท่านสังเกตเห็นข้อความเตือนเมื่อรหัสมาจากคำแนะนำของ AI ที่ยังไม่ได้ตรวจสอบ | | | | | |

### ส่วนที่ 6 — ความคิดเห็นเพิ่มเติม (คำถามปลายเปิด)

26. สิ่งที่ท่านชอบที่สุดเกี่ยวกับ MedCode AI คืออะไร?
27. สิ่งที่ทำให้ท่านหงุดหงิดที่สุด หรือสิ่งที่จะทำให้ท่านไม่อยากใช้งานทุกวันคืออะไร?
28. ท่านคิดว่าระบบยังขาดอะไร ก่อนที่ท่านจะไว้ใจใช้กับเวชระเบียนผู้ป่วยจริง?
29. ความคิดเห็นอื่นๆ:

### ส่วนที่ 7 — ภาพรวม

30. หากมีเพื่อนร่วมงานผู้ให้รหัสถามความเห็น ท่านจะแนะนำ MedCode AI ให้เขาใช้หรือไม่? (0 = ไม่แนะนำเลย, 10 = แนะนำอย่างยิ่ง)
    0 — 1 — 2 — 3 — 4 — 5 — 6 — 7 — 8 — 9 — 10

*ขอบคุณสำหรับเวลาของท่าน*

---

## Deployment options (open question — pick before use)

Not decided here; both are valid depending on hospital IT policy:

- **Paper form** — print this section, no PDPA cross-border data-transfer
  question, easiest for a small pilot team, but slower to tabulate.
- **Google Forms (Thai UI available)** — faster tabulation, but check
  whether the hospital's PDPA policy permits using a non-Thai-hosted cloud
  tool for staff data before choosing this route; if not, a self-hosted
  form (e.g. a simple page added to the existing `audit-chart-frontend`
  build) avoids the question entirely.

## English reference version of the scale items (for report body / non-Thai readers)

| # | Item | Adapted from |
|---|---|---|
| 5 | The MedCode AI dashboard was easy to navigate | SUS item 3 |
| 6 | I needed extra help/training to use basic functions (reverse-scored) | SUS item 4 |
| 7 | Syncing cases from the hospital system (iMed) was straightforward | Health-ITUES ease-of-use |
| 8 | The chart layout helped me find what I needed to code | Health-ITUES ease-of-use |
| 9 | Reviewing/approving codes felt efficient vs. my usual process | Health-ITUES perceived usefulness |
| 10 | I was confident I understood what each screen asked of me | SUS item 7 |
| 11 | The system was consistent — screens behaved as expected | SUS item 6 |
| 12 | I'd be comfortable using this daily if rolled out hospital-wide | Health-ITUES impact / adoption intent |
| 13 | AI-suggested codes were usually relevant | coding-specific |
| 14 | I could tell when an AI suggestion was likely wrong | coding-specific |
| 15 | I trusted the AI enough to consider its suggestions | S-TIAS trust item |
| 16 | I would rely on the AI's suggestions in future coding (advisory-only, coder approves) | S-TIAS reliance-intent item |
| 17 | AI Agent chat answers matched official coding references | coding-specific |
| 24 | I always understood I — not the AI — was responsible for the final code | safeguard-check, coding-specific |
| 25 | I noticed the warning for unreviewed AI-suggested codes | safeguard-check, coding-specific |
| 30 | Likelihood to recommend to a coding colleague (0–10) | Net Promoter Score-style |

Sources for the adapted instruments:
- [A Guide to the System Usability Scale (SUS) and Its Scores](https://trymata.com/blog/system-usability-scale-sus/)
- [Health Information Technology Usability Evaluation Scale (Health-ITUES) — validation study](https://mhealth.jmir.org/2018/1/e4/)
- [Examining construct and predictive validity of the Health-IT Usability Evaluation Scale](https://academic.oup.com/jamia/article/21/e2/e241/703315)
- [Measuring trust in artificial intelligence: validation of an established scale and its short form (S-TIAS)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12098057/)
- [Review: Trust in Artificial Intelligence–Based Clinical Decision Support](https://www.jmir.org/2025/1/e69678/PDF)
- [Effect of an AI-powered clinical workflow tool on CDI queries](https://www.tandfonline.com/doi/full/10.1080/29947448.2025.2520761)
- [Employer's Data Obligation Under Thailand's PDPA](https://securiti.ai/blog/employee-data-thailand/)
- [Navigating PDPA in Thailand: Compliance Guide 2026](https://www.moore-gsia.com/pdpa-thailand/)
