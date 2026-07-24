export type ChatMode = 'learn' | 'dict'

export type AgentMessage = {
  id: number
  role: 'coder' | 'agent'
  text: string
  learned?: boolean
  time: string
}

export type AgentSeedExample = {
  cc: string
  pi: string
  code: string
  role: string
}

export const WELCOME: Record<ChatMode, string> = {
  learn:
    "Hi! I'm trained on your hospital's approved ICD-9 cases. Describe the patient's condition and I'll suggest codes.",
  dict: 'Ask me anything about ICD-9 codes — I can check correctness, explain definitions, and validate code sequences.',
}

export const CHIPS: Record<ChatMode, string[]> = {
  learn: [
    'Patient has chest pain and ST elevation on ECG. What ICD-9 codes apply?',
    'Diabetic patient with acute kidney injury. Suggest primary and comorbidity codes.',
    'Post-op fever after appendectomy. Chief complaint: abdominal pain.',
  ],
  dict: [
    'Is 427.31 the correct code for atrial fibrillation?',
    "What's the difference between 250.00 and 250.01 in diabetes coding?",
    'Check if this code sequence is valid: Primary 428.0, Comorbidity 401.9, 250.00',
  ],
}

export const REPLIES: Record<ChatMode, string[]> = {
  learn: [
    'For chest pain with ST elevation on ECG, I suggest: **Primary 410.91** — Acute myocardial infarction, unspecified site, initial episode. If the anterior wall is confirmed, use **410.11** instead. Common comorbidities from similar approved cases: **401.9** (Essential hypertension) and **272.4** (Hyperlipidemia). Consider **414.01** if coronary atherosclerosis of a native artery is documented.',
    'For a diabetic patient with acute kidney injury: **Primary 584.9** — Acute kidney failure, unspecified. Comorbidity: **250.40** — Diabetes with renal manifestations, type II. Your hospital\'s approved cases usually add **585.9** (CKD, unspecified) when a chronic baseline is documented — check the creatinine history in the record.',
    'Post-operative fever after appendectomy: **Primary 998.89** — Other specified complications of procedures. Code the appendicitis that led to surgery as **540.9** (Acute appendicitis without peritonitis). If an intra-abdominal abscess is confirmed, use **998.59** (Other postoperative infection) instead. Comorbidity **780.60** (Fever, unspecified) only if no infectious source is found.',
  ],
  dict: [
    '**427.31 — Atrial fibrillation.** Yes, that is the correct ICD-9-CM code for atrial fibrillation. Usage note: it covers paroxysmal, persistent and chronic AF — ICD-9 does not distinguish subtypes (ICD-10\'s I48.x family does). Atrial *flutter* is coded separately as **427.32**.',
    '**250.00** is Diabetes mellitus without complication, **type II** or unspecified, not stated as uncontrolled. **250.01** is the same but **type I** (juvenile type). The 5th digit encodes type and control: 0 = type II controlled, 1 = type I controlled, 2 = type II uncontrolled, 3 = type I uncontrolled. Pick by the documented type first, control status second.',
    'Sequence check — **Primary 428.0** (Congestive heart failure, unspecified) with comorbidities **401.9** (Essential hypertension) and **250.00** (Type II diabetes without complication): this is a **valid** sequence. One caution: if the record documents hypertensive heart disease as the cause of the CHF, coding guidelines prefer **402.91** (Hypertensive heart disease with heart failure) as principal, with 428.0 as an additional code.',
  ],
}

export const MOCK_SEED_EXAMPLE: AgentSeedExample = {
  cc: 'Chest pain radiating to left arm',
  pi: 'Acute onset while at rest, diaphoresis, ST elevation on ECG',
  code: '410.91',
  role: 'principal_diagnosis',
}
