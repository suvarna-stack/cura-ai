// ============================================================
// Lightweight i18n — English for the dev team, Thai for the
// hospital's coders. No library: one dictionary, one t() helper.
// Persisted in localStorage ("lang"). Add keys here as UI grows.
// The provider component lives in LanguageProvider.tsx.
// ============================================================
import { createContext, useContext } from "react";

export type Lang = "en" | "th";

export const dict: Record<string, { en: string; th: string }> = {
  // top nav
  "nav.dashboard": { en: "Dashboard",  th: "แดชบอร์ด" },
  "nav.analytics": { en: "Analytics",  th: "วิเคราะห์ข้อมูล" },
  "nav.agent":     { en: "AI Agent",   th: "AI ผู้ช่วย" },
  "nav.settings":  { en: "Settings",   th: "การตั้งค่า" },
  // sync section
  "sync.label":    { en: "iMed sync",  th: "ซิงค์ iMed" },
  "sync.ago2m":    { en: "2 min ago",  th: "2 นาทีที่แล้ว" },
  "sync.justNow":  { en: "just now",   th: "เมื่อสักครู่" },
  "sync.failed":   { en: "sync failed", th: "ซิงค์ไม่สำเร็จ" },
  "sync.btn":      { en: "Sync",       th: "ซิงค์" },
  "sync.syncing":  { en: "Syncing…",   th: "กำลังซิงค์…" },
  // tabs
  "tab.complete":   { en: "Complete",   th: "สมบูรณ์" },
  "tab.incomplete": { en: "Incomplete", th: "ไม่สมบูรณ์" },
  "tab.reopen":     { en: "Reopened",   th: "เปิดใหม่" },
  "tab.finished":   { en: "Finished",   th: "เสร็จสิ้น" },
  "reopen.empty":   { en: "No reopened cases — reopen a finished case to edit it again", th: "ไม่มีเคสที่เปิดใหม่ — เปิดเคสที่เสร็จสิ้นอีกครั้งเพื่อแก้ไข" },
  // list + selection
  "list.search":    { en: "Search VN, HN, ICD code…", th: "ค้นหา VN, HN, รหัส ICD…" },
  "list.clearSearch": { en: "Clear search", th: "ล้างคำค้นหา" },
  "sel.selectAll":  { en: "Select all ({n})",        th: "เลือกทั้งหมด ({n})" },
  "sel.count":      { en: "{n} of {total} selected", th: "เลือก {n} จาก {total} เคส" },
  "sel.hint":       { en: "tick cases to select, or use the box above for all", th: "ติ๊กเลือกเคส หรือใช้กล่องด้านบนเพื่อเลือกทั้งหมด" },
  "sel.approve":    { en: "Approve selected ({n})",  th: "อนุมัติที่เลือก ({n})" },
  "sel.countIncomplete": { en: "{n} case(s) selected", th: "เลือก {n} เคส" },
  "sel.clear":      { en: "Clear", th: "ล้าง" },
  "btn.approve":    { en: "Approve",  th: "อนุมัติ" },
  "btn.view":       { en: "View",     th: "ดู" },
  "btn.review":     { en: "Review",   th: "ตรวจสอบ" },
  "btn.reopen":     { en: "Reopen",   th: "เปิดใหม่" },
  "btn.approveGroup":     { en: "Approve Group", th: "อนุมัติกลุ่ม" },
  "btn.approveAllGroups": { en: "Approve All Groups ({n} cases)", th: "อนุมัติทุกกลุ่ม ({n} เคส)" },
  "group.cases":    { en: "{n} cases", th: "{n} เคส" },
  "missing.count":  { en: "{n} missing", th: "ขาด {n} รายการ" },
  // SOAP-note abbreviations for missing documents (same in EN/TH — standard in Thai hospitals)
  "missing.doc.cc": { en: "CC",  th: "CC" },
  "missing.doc.pe": { en: "PE",  th: "PE" },
  "missing.doc.ap": { en: "A/P", th: "A/P" },
  "missing.doc.dx": { en: "Dx",  th: "Dx" },
  "group.more":     { en: "+ {n} more cases in this group…", th: "+ อีก {n} เคสในกลุ่มนี้…" },
  // pagination
  "page.prev": { en: "Prev",  th: "ก่อนหน้า" },
  "page.next": { en: "Next",  th: "ถัดไป" },
  "page.goto": { en: "Go to", th: "ไปที่หน้า" },
  "page.go":   { en: "Go",    th: "ไป" },
  // approval confirmation dialog
  "confirm.title":   { en: "Approve cases?", th: "อนุมัติเคส?" },
  "confirm.body":    { en: "You're about to approve {n} case(s). They'll move to the Finished queue. You can reopen them later if needed.", th: "คุณกำลังจะอนุมัติ {n} เคส เคสเหล่านี้จะถูกย้ายไปยังคิวเสร็จสิ้น คุณสามารถเปิดใหม่ได้ภายหลังหากจำเป็น" },
  "confirm.confirm": { en: "Approve {n}", th: "อนุมัติ {n}" },
  "confirm.cancel":  { en: "Cancel", th: "ยกเลิก" },
  // case detail pages
  "detail.approveAll":     { en: "Approve", th: "อนุมัติ" },
  "detail.unapprove":      { en: "Unapprove",         th: "ยกเลิกการอนุมัติ" },
  "detail.pending":        { en: "Pending Approval",  th: "รออนุมัติ" },
  "detail.approvedOn":     { en: "Approved · {date}", th: "อนุมัติแล้ว · {date}" },
  "detail.fieldsPending":  { en: "{n} fields pending", th: "รอข้อมูล {n} รายการ" },
  "detail.readyToApprove": { en: "Ready to approve",  th: "พร้อมอนุมัติ" },
  // row meta labels
  // VN / HN identity on the case cards (meeting item 2)
  "ident.hnMissing":      { en: "HN is not supplied by iMed for OPD visits (admissionnumber is IPD-only)",
                            th: "iMed ไม่ส่ง HN สำหรับผู้ป่วยนอก (admissionnumber มีเฉพาะผู้ป่วยใน)" },
  "ident.hnMissingShort": { en: "not supplied for OPD", th: "ไม่มีข้อมูลสำหรับผู้ป่วยนอก" },
  // report header (item 8)
  "report.mdMissing":  { en: "The iMed extract carries no attending physician (MD) field",
                         th: "ข้อมูลจาก iMed ไม่มีฟิลด์แพทย์ผู้รักษา (MD)" },
  "report.partMissing": { en: "{part} is not in this record — the AI cannot suggest codes from it",
                          th: "ไม่มี {part} ในเวชระเบียนนี้ — AI จึงแนะนำรหัสจากส่วนนี้ไม่ได้" },
  "report.orders":       { en: "Orders & results", th: "คำสั่งและผลตรวจ" },
  "report.moreOrders":   { en: "more — click to expand", th: "รายการ — คลิกเพื่อดูทั้งหมด" },
  "report.ordersCapped": { en: "showing {shown} of {total} — the rest are not sent in one payload",
                           th: "แสดง {shown} จาก {total} รายการ — ส่วนที่เหลือไม่ได้ส่งมาในชุดข้อมูลเดียว" },
  "meta.dept":     { en: "Dept",     th: "แผนก" },
  "meta.coverage": { en: "Coverage", th: "สิทธิ" },
  "meta.date":     { en: "Date",     th: "วันที่" },
  // filters + sort
  "filter.title":     { en: "Filters",    th: "ตัวกรอง" },
  "filter.clearAll":  { en: "Clear all",  th: "ล้างทั้งหมด" },
  "filter.match":     { en: "{n} cases match", th: "ตรงกับ {n} เคส" },
  "filter.viewing":   { en: "Filtered view — showing {n} of {total} cases", th: "มุมมองที่กรอง — แสดง {n} จาก {total} เคส" },
  "filter.emptyHidden": { en: "No cases match your filters or search — {n} cases are hidden", th: "ไม่มีเคสตรงกับตัวกรองหรือคำค้นหา — มีอีก {n} เคสที่ถูกซ่อนไว้" },
  "filter.showAll":   { en: "Show all", th: "แสดงทั้งหมด" },
  "filter.breakdown": { en: "{c} complete · {i} incomplete", th: "สมบูรณ์ {c} · ไม่สมบูรณ์ {i}" },
  "sort.title":   { en: "Sort by",      th: "เรียงตาม" },
  "sort.newest":  { en: "Newest first", th: "ใหม่ที่สุดก่อน" },
  "sort.oldest":  { en: "Oldest first", th: "เก่าที่สุดก่อน" },
  "sort.highest": { en: "Highest Confidence ↓", th: "ความมั่นใจสูงสุด ↓" },
  "sort.lowest":  { en: "Lowest Confidence ↑",  th: "ความมั่นใจต่ำสุด ↑" },
  "sort.codeAz":  { en: "Code A–Z",             th: "รหัส A–Z" },
  // confidence pill (feedback: label the number so coders know what it means)
  "confidence.label":   { en: "AI Confidence: {n}%", th: "ความมั่นใจ AI: {n}%" },
  "confidence.none":    { en: "AI Confidence: —", th: "ความมั่นใจ AI: —" },
  "confidence.loading": { en: "AI Confidence: …", th: "ความมั่นใจ AI: …" },
  "confidence.tooltip": {
    en: "This percentage indicates how confident the AI model is about the suggested ICD codes for this case.",
    th: "เปอร์เซ็นต์นี้แสดงระดับความมั่นใจของโมเดล AI ต่อรหัส ICD ที่แนะนำสำหรับเคสนี้",
  },
  // date filter + display
  "date.today":        { en: "Today",         th: "วันนี้" },
  "date.thisWeek":     { en: "This Week",     th: "สัปดาห์นี้" },
  "date.thisMonth":    { en: "This Month",    th: "เดือนนี้" },
  "date.thisYear":     { en: "This Year",     th: "ปีนี้" },
  "date.specificDate": { en: "Specific Date", th: "วันที่ระบุ" },
  "date.dateRange":    { en: "Date Range",    th: "ช่วงวันที่" },
  "date.quick":        { en: "Quick",         th: "ด่วน" },
  "date.from":         { en: "From",          th: "จาก" },
  "date.to":           { en: "To",            th: "ถึง" },
  "date.title":        { en: "Date",          th: "วันที่" },
  "date.clearFilter":  { en: "Clear date filter", th: "ล้างตัวกรองวันที่" },
  // activity log
  "activity.title":    { en: "Activity Log",  th: "บันทึกกิจกรรม" },
  "activity.undo":     { en: "Undo",          th: "ยกเลิก" },
  "activity.undone":   { en: "Undone",        th: "ยกเลิกแล้ว" },
  "activity.clearAll": { en: "Clear All",     th: "ล้างทั้งหมด" },
  "activity.empty":    { en: "No recent activity", th: "ไม่มีกิจกรรมล่าสุด" },
  "activity.actionUndone": { en: "↩️ Action undone", th: "↩️ ยกเลิกการกระทำแล้ว" },
  // add / delete / approve code dialogs
  "confirm.deleteCode":     { en: "Delete Suggested Code", th: "ลบรหัสที่แนะนำ" },
  "confirm.deleteCodeBody": {
    en: "Are you sure you want to remove {code} from this case? This can be undone within 24 hours.",
    th: "คุณแน่ใจหรือไม่ว่าต้องการลบ {code} ออกจากเคสนี้? สามารถยกเลิกได้ภายใน 24 ชั่วโมง",
  },
  "confirm.delete":  { en: "Delete", th: "ลบ" },
  "confirm.addCode": { en: "Add Code", th: "เพิ่มรหัส" },
  // code cards (items 10 & 12)
  "code.edit":    { en: "Edit code", th: "แก้ไขรหัส" },
  "code.drag":     { en: "Drag to reorder — position is the code's priority", th: "ลากเพื่อจัดลำดับ — ตำแหน่งคือลำดับความสำคัญของรหัส" },
  "code.icd10Box": { en: "ICD-10 (diagnosis)", th: "ICD-10 (การวินิจฉัย)" },
  "code.icd9Box":  { en: "ICD-9 (procedure)",  th: "ICD-9 (หัตถการ)" },
  "code.addTo":    { en: "Add {system} code",  th: "เพิ่มรหัส {system}" },
  "code.emptyBox": { en: "No {system} code on this case yet.", th: "ยังไม่มีรหัส {system} ในเคสนี้" },
  "code.colSummary":      { en: "{n} code(s) · avg {avg}% confidence", th: "{n} รหัส · ความมั่นใจเฉลี่ย {avg}%" },
  "code.colSummaryEmpty": { en: "nothing suggested yet", th: "ยังไม่มีรหัสที่แนะนำ" },
  "confirm.approveCodesBody": {
    en: "You are about to approve {n} code(s) for {patientName}. This will mark the case as complete.",
    th: "คุณกำลังจะอนุมัติ {n} รหัสสำหรับ {patientName} เคสนี้จะถูกทำเครื่องหมายว่าเสร็จสมบูรณ์",
  },
  // the code system now comes from which box the coder fills (item 11), so
  // the role labels are system-neutral; other/external complete the hospital
  // dropdown's four diagnosis kinds (ICD-10 box only, 2026-07-30)
  "code.type.primary":     { en: "Primary Diagnosis",       th: "การวินิจฉัยหลัก" },
  // one primary ICD-10 per case — suffix shown on the disabled dropdown option
  "code.primaryTaken":     { en: " — already assigned",     th: " — กำหนดไว้แล้ว" },
  "code.type.comorbidity": { en: "Comorbidity",             th: "โรคร่วม" },
  "code.type.other":       { en: "Other",                   th: "อื่น ๆ" },
  "code.type.external":    { en: "External Cause of Injury", th: "สาเหตุภายนอกของการบาดเจ็บ" },
  "code.manualBadge":      { en: "Manually Added",          th: "เพิ่มด้วยตนเอง" },
  "code.codeLabel":        { en: "Code",                    th: "รหัส" },
  "code.addHint":          { en: "Fill in either box — or both to add an ICD-10 and an ICD-9 code at once.",
                             th: "กรอกกล่องใดกล่องหนึ่ง หรือทั้งสองกล่องเพื่อเพิ่มรหัส ICD-10 และ ICD-9 พร้อมกัน" },
  "code.addBoth":          { en: "Add both codes",          th: "เพิ่มทั้งสองรหัส" },
  "code.typeLabel":        { en: "Code Type",               th: "ประเภทรหัส" },
  "code.descLabel":        { en: "Description",             th: "คำอธิบาย" },
  // ICD-9 = procedure, and a procedure happens over a time window (2026-07-30)
  "code.opStart":          { en: "Operation Start",         th: "เวลาเริ่มหัตถการ" },
  "code.opEnd":            { en: "Operation End",           th: "เวลาสิ้นสุดหัตถการ" },
  // …and has a type — the hospital UI's "Type" dropdown on the operation grid
  "code.opType":           { en: "Operation Type",          th: "ประเภทหัตถการ" },
  // hospital-style laboratory results table (grouped by panel)
  "report.labs":           { en: "Laboratory",              th: "ผลตรวจทางห้องปฏิบัติการ" },
  // per-code note, like the hospital UI's Note column — internal to MedCode AI
  "code.noteLabel":        { en: "Note (internal)",         th: "หมายเหตุ (ภายในระบบ)" },
  "code.notePlaceholder":  { en: "Kept in MedCode AI only — not sent to the hospital",
                             th: "เก็บในระบบ MedCode AI เท่านั้น ไม่ส่งไปโรงพยาบาล" },
  // hospital vital-sign readings (the strip above CC/PI/PE in the original coder UI)
  "vitals.title":          { en: "Vital Signs",             th: "สัญญาณชีพ" },
  // hospital-style panel view of the record (2026-07-31), panel titles copied
  // from the hospital's own coder screen
  "hosp.view":        { en: "Hospital view",            th: "มุมมองโรงพยาบาล" },
  "hosp.viewChrono":  { en: "Chronological",            th: "ตามลำดับเวลา" },
  "hosp.ccpipe":      { en: "CC, PI, PE",               th: "CC, PI, PE" },
  "hosp.pastHistory": { en: "Past History",             th: "ประวัติในอดีต" },
  "hosp.labxray":     { en: "Lab / X-ray",              th: "แลบ / เอกซเรย์" },
  "hosp.xray":        { en: "X-Ray",                    th: "เอกซเรย์" },
  "hosp.diagproc":    { en: "Diagnosis / Procedure",    th: "การวินิจฉัย / หัตถการ" },
  "hosp.procedures":  { en: "Procedures (หัตถการ)",     th: "หัตถการ" },
  "hosp.cpoe":        { en: "Order Entry (CPOE)",       th: "รายการสั่งแพทย์ (CPOE)" },
  "hosp.invfinding":  { en: "Investigations Finding",   th: "ผลการตรวจเพิ่มเติม" },
  "hosp.mgmt":        { en: "Management / Suggestion",  th: "การรักษา / คำแนะนำ" },
  "hosp.progress":    { en: "Progress / Other Notes",   th: "บันทึกความคืบหน้า / อื่น ๆ" },
  "hosp.orderName":   { en: "Order Name",               th: "ชื่อรายการ" },
  "hosp.qty":         { en: "Qty.",                     th: "จำนวน" },
  "hosp.empty":       { en: "No entries",               th: "ไม่มีข้อมูล" },
  "hosp.shownOf":     { en: "showing {shown} of {total} orders", th: "แสดง {shown} จาก {total} รายการ" },
  // case history
  "btn.viewHistory": { en: "View History", th: "ดูประวัติ" },
  "history.title":   { en: "Case History", th: "ประวัติเคส" },
  "history.empty":   { en: "No activity recorded for this case yet.", th: "ยังไม่มีกิจกรรมสำหรับเคสนี้" },
  // item 17: rows that came from the server audit trail (any coder, any browser)
  "history.server":     { en: "system record", th: "บันทึกของระบบ" },
  "history.serverHint": { en: "Recorded on the server — this is what another coder did, so it cannot be undone here",
                          th: "บันทึกไว้บนเซิร์ฟเวอร์ — เป็นการทำงานของผู้ให้รหัสคนอื่น จึงย้อนกลับที่นี่ไม่ได้" },
  "history.back":    { en: "Back", th: "ย้อนกลับ" },
  // facet labels (keys match FACET_DEFS in useCaseFilters)
  "facet.coverage":  { en: "Healthcare Coverage (สิทธิการรักษา)", th: "สิทธิการรักษา" },
  "facet.ordercat":  { en: "Order Type",   th: "ประเภทคำสั่ง" },
  // second level of the order filter (CT/X-ray -> Chest PA / CT Brain / …)
  "facet.ordername": { en: "Study / Item",  th: "รายการตรวจ / ยา" },
  "facet.ordernameEmpty": { en: "no items recorded", th: "ไม่มีรายการที่บันทึกไว้" },
  // the Study/Item list can hold hundreds of entries, so it is searchable
  "facet.ordernameSearch": { en: "Search items…", th: "ค้นหารายการ…" },
  "facet.ordernameMore":   { en: "+ {n} more — type to narrow", th: "+ อีก {n} รายการ — พิมพ์เพื่อค้นหา" },
  "facet.ordernameNoMatch": { en: "no items match “{q}”", th: "ไม่พบรายการที่ตรงกับ “{q}”" },
  "facet.coder":     { en: "Coder",        th: "ผู้ให้รหัส" },
  // filter by the case's diagnosis / procedure codes
  "facet.icd10":     { en: "ICD-10", th: "ICD-10" },
  "facet.icd9":      { en: "ICD-9",  th: "ICD-9" },
  // a case can have many coders (item 16); the row names the latest one
  "coder.plusOthers": { en: "+{n} more", th: "+อีก {n}" },
  "coder.all":        { en: "Coders",    th: "ผู้ให้รหัส" },
  // Reopen tab: whose finished work was pulled back, and by whom
  "reopen.finishedBy": { en: "Finished by", th: "ทำเสร็จโดย" },
  "reopen.reopenedBy": { en: "Reopened by", th: "เปิดใหม่โดย" },
  "facet.dept":      { en: "Department",   th: "แผนก" },
  // screen-reader-only names (WCAG pass, 2026-07-31)
  "a11y.close":     { en: "Close",     th: "ปิด" },
  "a11y.loading":   { en: "Loading…",  th: "กำลังโหลด…" },
  "a11y.selectCase": { en: "Select case {vn}", th: "เลือกเคส {vn}" },
  "a11y.results":   { en: "{n} results",  th: "{n} รายการ" },
  "a11y.skip":      { en: "Skip to main content", th: "ข้ามไปยังเนื้อหาหลัก" },
  "a11y.caseTabs":  { en: "Case queues", th: "คิวเคส" },
  // settings
  "settings.title":         { en: "Settings", th: "การตั้งค่า" },
  "settings.sub":           { en: "Preferences & appearance", th: "การตั้งค่าและธีม" },
  "settings.appearance":    { en: "Appearance", th: "ธีม" },
  "settings.appearanceSub": { en: "Choose your preferred theme", th: "เลือกธีมที่ต้องการ" },
  "settings.language":      { en: "Language", th: "ภาษา" },
  "settings.languageSub":   { en: "Interface language", th: "ภาษาของหน้าจอ" },
  "settings.account":       { en: "Account", th: "บัญชีผู้ใช้" },
  "settings.accountSub":    { en: "Your profile information", th: "ข้อมูลโปรไฟล์ของคุณ" },
};

type LanguageCtxValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export const LanguageCtx = createContext<LanguageCtxValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

export const useLang = () => useContext(LanguageCtx);
