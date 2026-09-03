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
  "sync.all":      { en: "Sync all",   th: "ซิงค์ทั้งหมด" },
  // tabs
  "tab.complete":   { en: "Complete",   th: "สมบูรณ์" },
  "tab.incomplete": { en: "Incomplete", th: "ไม่สมบูรณ์" },
  "tab.reopen":     { en: "Reopened",   th: "เปิดใหม่" },
  "tab.finished":   { en: "Finished",   th: "เสร็จสิ้น" },
  // empty tabs — each says why it's empty and points at the action that fills it
  "empty.complete.title":   { en: "No complete cases right now", th: "ยังไม่มีเคสสมบูรณ์ในขณะนี้" },
  "empty.complete.sub":     { en: "A case shows here when it arrives from the hospital already coded with both ICD-10 and ICD-9.", th: "เคสจะแสดงที่นี่เมื่อข้อมูลจากโรงพยาบาลมีรหัสทั้ง ICD-10 และ ICD-9 ครบแล้ว" },
  "empty.incomplete.title": { en: "No incomplete cases", th: "ไม่มีเคสไม่สมบูรณ์" },
  "empty.incomplete.sub":   { en: "Cases still missing ICD-10 or ICD-9 codes will wait here.", th: "เคสที่ยังขาดรหัส ICD-10 หรือ ICD-9 จะรออยู่ที่นี่" },
  "empty.reopen.title":     { en: "Nothing has been reopened", th: "ยังไม่มีเคสที่เปิดใหม่" },
  "empty.reopen.sub":       { en: "Reopen a finished case to edit it again — it will wait here until it's re-approved.", th: "เปิดเคสที่เสร็จสิ้นอีกครั้งเพื่อแก้ไข — เคสจะรออยู่ที่นี่จนกว่าจะอนุมัติใหม่" },
  "empty.finished.title":   { en: "No finished cases yet", th: "ยังไม่มีเคสเสร็จสิ้น" },
  "empty.finished.sub":     { en: "Cases you approve move here, and their codes are sent back to the hospital.", th: "เคสที่อนุมัติแล้วจะย้ายมาที่นี่ และรหัสจะถูกส่งกลับไปยังโรงพยาบาล" },
  "empty.noData.title":     { en: "No cases yet", th: "ยังไม่มีเคส" },
  "empty.noData.sub":       { en: "Case data comes from the hospital's iMed system. Run a sync to pull it in.", th: "ข้อมูลเคสมาจากระบบ iMed ของโรงพยาบาล กดซิงค์เพื่อดึงข้อมูล" },
  "empty.noData.action":    { en: "Sync from hospital", th: "ซิงค์จากโรงพยาบาล" },
  "empty.action.viewComplete":   { en: "View complete cases ({n})", th: "ดูเคสสมบูรณ์ ({n})" },
  "empty.action.viewIncomplete": { en: "View incomplete cases ({n})", th: "ดูเคสไม่สมบูรณ์ ({n})" },
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
  "case.locked.title":     { en: "This case is being worked on", th: "เคสนี้กำลังมีผู้ทำงานอยู่" },
  "case.locked.by":        { en: "Currently open by", th: "กำลังเปิดโดย" },
  "case.locked.case":      { en: "Case", th: "เคส" },
  "case.locked.hint":      { en: "Only one coder can work on a case at a time. It unlocks the moment they leave — try again shortly.", th: "เคสหนึ่งทำงานได้ทีละคนเท่านั้น เคสจะปลดล็อกทันทีที่อีกฝ่ายออกจากหน้า — ลองใหม่อีกสักครู่" },
  "case.locked.back":      { en: "Back to dashboard", th: "กลับสู่แดชบอร์ด" },
  "detail.approveAll":     { en: "Approve", th: "อนุมัติ" },
  // the approve button counts the ticked codes (selection-first review)
  "detail.approveN":       { en: "Approve ({n})", th: "อนุมัติ ({n})" },
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
  // shown when an admin has switched the name field ON but the hospital
  // extract carries no patient name (open Data-Mapping question Q1)
  "ident.nameMissing":    { en: "Name not supplied by iMed", th: "iMed ไม่ได้ส่งชื่อผู้ป่วย" },
  // report header (item 8)
  "report.mdMissing":  { en: "The iMed extract carries no attending physician (MD) field",
                         th: "ข้อมูลจาก iMed ไม่มีฟิลด์แพทย์ผู้รักษา (MD)" },
  "report.partMissing": { en: "{part} is not in this record — the AI cannot suggest codes from it",
                          th: "ไม่มี {part} ในเวชระเบียนนี้ — AI จึงแนะนำรหัสจากส่วนนี้ไม่ได้" },
  "report.partPresent": { en: "{part} is recorded in this visit",
                          th: "มี {part} ในเวชระเบียนนี้" },
  // the count badge on the Order / Lab / X-ray / Operative chips
  "report.partCount":   { en: "{n} {part} record(s) in this visit",
                          th: "{part} {n} รายการในเวชระเบียนนี้" },
  "report.orders":       { en: "Orders & results", th: "คำสั่งและผลตรวจ" },
  "report.moreOrders":   { en: "more — click to expand", th: "รายการ — คลิกเพื่อดูทั้งหมด" },
  "report.ordersCapped": { en: "showing {shown} of {total} — the rest are not sent in one payload",
                           th: "แสดง {shown} จาก {total} รายการ — ส่วนที่เหลือไม่ได้ส่งมาในชุดข้อมูลเดียว" },
  "meta.dept":     { en: "Dept",     th: "แผนก" },
  "meta.coverage": { en: "Coverage", th: "สิทธิ" },
  "meta.date":     { en: "Date",     th: "วันที่" },
  "meta.age":      { en: "Age",      th: "อายุ" },
  // filters + sort
  "filter.title":     { en: "Filters",    th: "ตัวกรอง" },
  "filter.clearAll":  { en: "Clear all",  th: "ล้างทั้งหมด" },
  "filter.match":     { en: "{n} cases match", th: "ตรงกับ {n} เคส" },
  "filter.viewing":   { en: "Filtered view — showing {n} of {total} cases", th: "มุมมองที่กรอง — แสดง {n} จาก {total} เคส" },
  "filter.emptyHidden": { en: "No cases match your filters or search — {n} cases are hidden", th: "ไม่มีเคสตรงกับตัวกรองหรือคำค้นหา — มีอีก {n} เคสที่ถูกซ่อนไว้" },
  "filter.showAll":   { en: "Show all", th: "แสดงทั้งหมด" },
  "filter.breakdown": { en: "{c} complete · {i} incomplete", th: "สมบูรณ์ {c} · ไม่สมบูรณ์ {i}" },
  "filter.done":      { en: "Done", th: "เสร็จสิ้น" },
  // sync moved out of the page and into the header (2026-08-25)
  "sync.period":      { en: "Sync period", th: "ช่วงเวลาซิงค์" },
  "sync.button":      { en: "Sync", th: "ซิงค์" },
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
  "date.title":        { en: "Sync period",   th: "ช่วงเวลาซิงค์" },
  "date.clearFilter":  { en: "Clear period",  th: "ล้างช่วงเวลา" },
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
  // the % counts AI suggestions only — hospital codes are facts, not guesses
  "code.colSummary":      { en: "{n} code(s) · AI avg {avg}% confidence", th: "{n} รหัส · ความมั่นใจเฉลี่ยของ AI {avg}%" },
  "code.colSummaryNoAi":  { en: "{n} code(s)", th: "{n} รหัส" },
  "code.colSummaryEmpty": { en: "nothing suggested yet", th: "ยังไม่มีรหัสที่แนะนำ" },
  "confirm.approveCodesBody": {
    en: "You are about to approve the {n} code(s) you ticked for {patientName}. This will mark the case as complete.",
    th: "คุณกำลังจะอนุมัติ {n} รหัสที่คุณเลือกไว้สำหรับ {patientName} เคสนี้จะถูกทำเครื่องหมายว่าเสร็จสมบูรณ์",
  },
  // second sentence, only when suggestions were left unticked (2026-08-07)
  "confirm.approveSkipped": {
    en: " {n} unticked suggestion(s) stay on the case and are not sent to the hospital.",
    th: " รหัสที่แนะนำอีก {n} รายการที่ไม่ได้เลือกจะยังอยู่ในเคส และจะไม่ถูกส่งไปโรงพยาบาล",
  },
  // selection-first code review (2026-08-07): nothing is pre-ticked
  "code.pick":        { en: "Approve code {code}", th: "เลือกรหัส {code} เพื่ออนุมัติ" },
  "code.pickBlocked": { en: "Fill in this code before it can be approved",
                        th: "กรอกรหัสนี้ให้ครบก่อนจึงจะอนุมัติได้" },
  "code.pickAll":     { en: "Select all ({n})", th: "เลือกทั้งหมด ({n})" },
  "code.pickCount":   { en: "{n} of {total} selected", th: "เลือก {n} จาก {total}" },
  "code.pickHint":    { en: "Tick the codes that belong on this case.",
                        th: "ติ๊กเลือกรหัสที่ถูกต้องสำหรับเคสนี้" },
  "toast.approveBlocked": { en: "{n} case(s) still need a code in both columns — open them to finish",
                            th: "{n} เคสยังต้องมีรหัสทั้งสองคอลัมน์ — เปิดเคสเพื่อดำเนินการต่อ" },
  "toast.writeFailed": { en: "Couldn't confirm {n} case(s) reached the hospital record — try again",
                         th: "ไม่สามารถยืนยันได้ว่าส่งเคส {n} รายการถึงโรงพยาบาลแล้ว — กรุณาลองใหม่อีกครั้ง" },
  "code.noProc":      { en: "No procedure was performed on this visit",
                        th: "การมารับบริการครั้งนี้ไม่มีหัตถการ" },
  "code.pickNo10":    { en: "Tick an ICD-10 diagnosis code before approving",
                        th: "เลือกรหัสวินิจฉัย ICD-10 อย่างน้อย 1 รหัสก่อนอนุมัติ" },
  "code.pickNo9":     { en: "Tick an ICD-9 procedure code before approving",
                        th: "เลือกรหัสหัตถการ ICD-9 อย่างน้อย 1 รหัสก่อนอนุมัติ" },
  "code.pickNone":    { en: "Select at least one code to approve",
                        th: "เลือกอย่างน้อยหนึ่งรหัสก่อนอนุมัติ" },
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
  // origin-group sub-headers inside a code column (shown only when a column
  // holds both coder-entered and hospital/AI codes)
  // origin group headers — manual / hospital / AI / gaps (2026-08-07)
  "code.groupManual":      { en: "Added by coder",          th: "ผู้ให้รหัสเพิ่มเอง" },
  "code.groupHospital":    { en: "From hospital record",    th: "จากเวชระเบียนโรงพยาบาล" },
  "code.groupAi":          { en: "Suggested by AI",         th: "ข้อเสนอแนะจาก AI" },
  "code.groupGap":         { en: "Not documented",          th: "ไม่มีบันทึกไว้" },
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
  // per-code note, like the hospital UI's Note column — internal to Cura AI
  "code.noteLabel":        { en: "Note (internal)",         th: "หมายเหตุ (ภายในระบบ)" },
  "code.notePlaceholder":  { en: "Kept in Cura AI only — not sent to the hospital",
                             th: "เก็บในระบบ Cura AI เท่านั้น ไม่ส่งไปโรงพยาบาล" },
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
  "hosp.noXray":      { en: "No X-ray / imaging recorded for this visit", th: "ไม่มีผลเอกซเรย์ในการรับบริการครั้งนี้" },
  "hosp.noLab":       { en: "No lab results recorded for this visit",     th: "ไม่มีผลแลบในการรับบริการครั้งนี้" },
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
  // printing / exporting the approved case as a Coding Summary document
  "btn.print":       { en: "Print",      th: "พิมพ์" },
  "btn.exportPdf":   { en: "Export PDF", th: "บันทึกเป็น PDF" },
  "print.title":     { en: "Print coding summary", th: "พิมพ์สรุปการให้รหัส" },
  "print.exportTitle": { en: "Export coding summary as PDF", th: "บันทึกสรุปการให้รหัสเป็น PDF" },
  "print.opening":   { en: "Opening the print dialog\u2026", th: "กำลังเปิดหน้าต่างพิมพ์\u2026" },
  "print.saveHint":  { en: "Choose \u201cSave as PDF\u201d as the destination to download the file.",
                       th: "เลือกปลายทางเป็น \u201cบันทึกเป็น PDF\u201d เพื่อดาวน์โหลดไฟล์" },
  "print.notReady":  { en: "The case record is still loading \u2014 try again in a moment.",
                       th: "กำลังโหลดข้อมูลเคส กรุณาลองอีกครั้ง" },
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
  "filter.icd.select":      { en: "Select codes… ({n})", th: "เลือกรหัส… ({n})" },
  "filter.icd.dialogTitle": { en: "Filter by ICD code", th: "กรองตามรหัส ICD" },
  "filter.icd.search":      { en: "Search code or description…", th: "ค้นหารหัสหรือคำอธิบาย…" },
  "filter.icd.clear":       { en: "Clear {s}", th: "ล้าง {s}" },
  "filter.icd.show":        { en: "Show {n} cases", th: "แสดง {n} เคส" },
  "filter.icd.noMatch":     { en: "No codes match \"{q}\"", th: "ไม่มีรหัสที่ตรงกับ \"{q}\"" },
  "filter.icd.empty":       { en: "No codes on the current cases", th: "ไม่มีรหัสในเคสปัจจุบัน" },
  "filter.icd.more":        { en: "{n} more — refine your search", th: "อีก {n} รหัส — พิมพ์ค้นหาเพื่อดูเพิ่มเติม" },
  // a case can have many coders (item 16); the row names the latest one
  "coder.plusOthers": { en: "+{n} more", th: "+อีก {n}" },
  "coder.all":        { en: "Coders",    th: "ผู้ให้รหัส" },
  // Reopen tab: whose finished work was pulled back, and by whom
  // shared case star — the tooltip names whoever left it, because the point of
  // the star is that it is a message to another coder
  "star.add":    { en: "Mark case {vn} as important", th: "ทำเครื่องหมายเคส {vn} ว่าสำคัญ" },
  "star.remove": { en: "Remove the star from case {vn}", th: "เอาดาวออกจากเคส {vn}" },
  // a colleague's star: seen by all, cleared by its author only — so the
  // tooltip explains why there is nothing to click rather than staying silent
  "star.byLocked": { en: "Starred by {name} — only they can remove it",
                     th: "ติดดาวโดย {name} — เอาออกได้เฉพาะผู้ติดดาว" },
  // …and the same star inside the case, where it has room to say who left it
  // and when (the row only has room for the glyph), and doubles as the control
  "star.badgeBy": { en: "Starred by {name}", th: "ติดดาวโดย {name}" },
  "star.badge":   { en: "Starred",           th: "ติดดาว" },
  "star.mark":    { en: "Mark important",    th: "ทำเครื่องหมายว่าสำคัญ" },
  "star.unmark":  { en: "Remove this star",  th: "เอาดาวนี้ออก" },
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
  // AI agent page
  "agent.subtitle.learn": { en: "Suggest & Learn · grounded in your coding references", th: "แนะนำรหัส · อ้างอิงจากคลังความรู้การให้รหัสของคุณ" },
  "agent.subtitle.dict":  { en: "Code Dictionary · ICD reference", th: "พจนานุกรมรหัส · อ้างอิง ICD" },
  "agent.tab.learn":      { en: "🧠 Suggest & Learn", th: "🧠 แนะนำรหัส" },
  "agent.tab.dict":       { en: "📖 Code Dictionary", th: "📖 พจนานุกรมรหัส" },
  "agent.hint.learn":     { en: "Describe a patient's condition for code suggestions — or type a coding rule and the agent learns it.", th: "อธิบายอาการของผู้ป่วยเพื่อรับคำแนะนำรหัส — หรือพิมพ์กฎการให้รหัสแล้ว AI จะเรียนรู้เอง" },
  "agent.hint.dict":      { en: "Look up definitions, check code correctness, and validate primary/comorbidity sequences.", th: "ค้นหาความหมาย ตรวจสอบความถูกต้องของรหัส และตรวจสอบลำดับรหัสหลัก/โรคร่วม" },
  "agent.welcome.learn":  { en: "Hi! Describe the patient's condition and I'll suggest codes from your hospital's references — or teach me a coding rule in your own words (English or Thai) and I'll remember it.", th: "สวัสดีค่ะ! อธิบายอาการของผู้ป่วยแล้วฉันจะแนะนำรหัสจากเอกสารอ้างอิงของโรงพยาบาล — หรือสอนกฎการให้รหัสด้วยภาษาของคุณเอง (ไทยหรืออังกฤษ) แล้วฉันจะจำไว้" },
  "agent.welcome.dict":   { en: "Ask me anything about ICD codes — I can check correctness, explain definitions, and validate code sequences.", th: "ถามอะไรก็ได้เกี่ยวกับรหัส ICD — ฉันตรวจสอบความถูกต้อง อธิบายความหมาย และตรวจสอบลำดับรหัสได้" },
  "agent.placeholder.learn": { en: "Describe a condition for code suggestions — or teach me a coding rule…", th: "อธิบายอาการเพื่อรับคำแนะนำรหัส — หรือสอนกฎการให้รหัสให้ฉัน…" },
  "agent.placeholder.dict":  { en: "Ask about an ICD code, definition, or sequence…", th: "ถามเกี่ยวกับรหัส ICD ความหมาย หรือลำดับรหัส…" },
  "agent.thinking":       { en: "Thinking — the local model can take a minute…", th: "กำลังคิด — โมเดลในเครื่องอาจใช้เวลาสักครู่…" },
  "agent.error":          { en: "Sorry — the agent is unavailable right now.", th: "ขออภัย — ขณะนี้ AI ผู้ช่วยไม่พร้อมใช้งาน" },
  "agent.sources":        { en: "Sources", th: "แหล่งอ้างอิง" },
  "agent.unverified":     { en: "Not found in sources — verify before use", th: "ไม่พบในแหล่งอ้างอิง — โปรดตรวจสอบก่อนใช้" },
  "agent.enter":          { en: "to send", th: "เพื่อส่ง" },
  "agent.shiftEnter":     { en: "for new line", th: "ขึ้นบรรทัดใหม่" },
  "agent.chip.learn.0":   { en: "Patient has chest pain and ST elevation on ECG. What ICD codes apply?", th: "ผู้ป่วยเจ็บหน้าอกและพบ ST elevation ใน ECG ควรใช้รหัส ICD อะไร?" },
  "agent.chip.learn.1":   { en: "Diabetic patient with acute kidney injury. Suggest primary and comorbidity codes.", th: "ผู้ป่วยเบาหวานมีไตวายเฉียบพลัน แนะนำรหัสหลักและโรคร่วม" },
  "agent.chip.learn.2":   { en: "Post-op fever after appendectomy. Chief complaint: abdominal pain.", th: "มีไข้หลังผ่าตัดไส้ติ่ง อาการสำคัญ: ปวดท้อง" },
  "agent.chip.dict.0":    { en: "What does code A09 cover?", th: "รหัส A09 ครอบคลุมอะไรบ้าง?" },
  "agent.chip.dict.1":    { en: "What's the difference between principal diagnosis and comorbidity?", th: "การวินิจฉัยหลักกับโรคร่วมต่างกันอย่างไร?" },
  "agent.chip.dict.2":    { en: "When should an external cause code be added?", th: "ควรเพิ่มรหัสสาเหตุภายนอกเมื่อใด?" },
  // Suggest & Learn — the coder teaches a rule, the agent extracts, confirms
  // and remembers it. Wording stays plain on purpose: a coder is teaching a
  // colleague, not configuring a model.
  "agent.chip.teach.0":   { en: "Diabetic patient with acute kidney injury: code E11.22 as principal, add N17.9, do not code N18.9.", th: "ผู้ป่วยเบาหวานที่มีไตวายเฉียบพลัน ให้ลง E11.22 เป็นหลัก ตามด้วย N17.9 ไม่ต้องลง N18.9" },
  "agent.chip.teach.1":   { en: "Post-op fever with wound infection after appendectomy: use T81.4, not R50.9.", th: "มีไข้หลังผ่าตัดไส้ติ่งและมีแผลติดเชื้อ ให้ใช้ T81.4 ไม่ใช้ R50.9" },
  "agent.chip.teach.2":   { en: "For an open appendectomy always code the procedure 47.09.", th: "การผ่าตัดไส้ติ่งแบบเปิด ให้ลงรหัสหัตถการ 47.09 เสมอ" },
  "agent.learn.card.title":  { en: "This is what I understood", th: "นี่คือสิ่งที่ฉันเข้าใจ" },
  "agent.learn.card.rules":  { en: "read literally", th: "อ่านตามตัวอักษร" },
  "agent.learn.card.rulesHint": { en: "Read from your wording directly — check the roles before saving.", th: "อ่านจากข้อความของคุณโดยตรง — ตรวจสอบบทบาทของรหัสก่อนบันทึก" },
  "agent.learn.when":        { en: "WHEN", th: "เมื่อ" },
  "agent.learn.when.ph":     { en: "the situation this rule applies to", th: "สถานการณ์ที่ใช้กฎนี้" },
  "agent.learn.codes":       { en: "CODES", th: "รหัส" },
  "agent.learn.rule":        { en: "RULE", th: "กฎ" },
  "agent.learn.rule.ph":     { en: "what to do", th: "ต้องทำอย่างไร" },
  "agent.learn.reason":      { en: "WHY", th: "เหตุผล" },
  "agent.learn.reason.ph":   { en: "optional", th: "ไม่บังคับ" },
  "agent.learn.role.principal": { en: "principal", th: "หลัก" },
  "agent.learn.role.secondary": { en: "secondary", th: "รอง" },
  "agent.learn.role.exclude":   { en: "do not code", th: "ห้ามลง" },
  "agent.learn.addCode":     { en: "add code", th: "เพิ่มรหัส" },
  "agent.learn.removeCode":  { en: "Remove this code", th: "ลบรหัสนี้" },
  "agent.learn.edit":        { en: "Edit", th: "แก้ไข" },
  "agent.learn.done":        { en: "Done", th: "เสร็จ" },
  "agent.learn.save":        { en: "Save & Learn", th: "บันทึกและเรียนรู้" },
  "agent.learn.saving":      { en: "Saving…", th: "กำลังบันทึก…" },
  "agent.learn.discard":     { en: "Discard", th: "ยกเลิก" },
  "agent.learn.willApply":   { en: "Saved rules apply to future answers and case suggestions.", th: "กฎที่บันทึกจะมีผลกับคำตอบและคำแนะนำรหัสในเคสถัดไป" },
  "agent.learn.saved":       { en: "Learned", th: "เรียนรู้แล้ว" },
  "agent.learn.savedHint":   { en: "I'll point this out when the scenario comes back.", th: "ฉันจะแจ้งเตือนเมื่อพบสถานการณ์นี้อีก" },
  "agent.learn.error":       { en: "I couldn't read a coding rule from that. Mention the condition and the code(s) it should get.", th: "ฉันอ่านกฎการให้รหัสจากข้อความนั้นไม่ได้ กรุณาระบุอาการและรหัสที่ควรใช้" },
  "agent.learn.not":         { en: "not", th: "ไม่ใช้" },
  "agent.learn.applies":     { en: "Learned note applies:", th: "มีกฎที่สอนไว้:" },
  "agent.learn.aCoder":      { en: "a coder", th: "ผู้ให้รหัส" },
  "agent.learn.rules":       { en: "Learned rules", th: "กฎที่สอนไว้" },
  "agent.learn.rules.close": { en: "Close learned rules", th: "ปิดรายการกฎ" },
  "agent.learn.rules.loading": { en: "Loading…", th: "กำลังโหลด…" },
  "agent.learn.rules.empty": { en: "Nothing taught yet. Type a coding rule in the chat the way you'd explain it to a new coder.", th: "ยังไม่มีกฎที่สอนไว้ พิมพ์กฎการให้รหัสในแชทเหมือนที่คุณอธิบายให้เพื่อนร่วมงานใหม่ฟัง" },
  "agent.learn.used":        { en: "used", th: "ใช้แล้ว" },
  "agent.learn.mute":        { en: "Mute this rule", th: "ปิดใช้กฎนี้" },
  "agent.learn.unmute":      { en: "Use this rule again", th: "เปิดใช้กฎนี้อีกครั้ง" },
  "agent.learn.forget":      { en: "Forget this rule", th: "ลบกฎนี้" },
  "agent.learn.readonly":    { en: "Taught by another coder — you can read it, but only its author can change or delete it.", th: "ผู้ให้รหัสคนอื่นเป็นผู้สอนกฎนี้ — คุณดูได้ แต่เฉพาะผู้ที่สอนเท่านั้นที่แก้ไขหรือลบได้" },
  "agent.learn.error.change": { en: "I couldn't change that rule. Only the coder who taught it can edit, mute or delete it.", th: "เปลี่ยนกฎนี้ไม่ได้ เฉพาะผู้ให้รหัสที่สอนกฎนี้เท่านั้นที่แก้ไข ปิดใช้ หรือลบได้" },
  "agent.history.title":  { en: "Chat history", th: "ประวัติแชท" },
  "agent.history.new":    { en: "New chat", th: "แชทใหม่" },
  "agent.history.empty":  { en: "No conversations yet", th: "ยังไม่มีบทสนทนา" },
  "agent.history.loading": { en: "Loading…", th: "กำลังโหลด…" },
  "agent.history.confirm": { en: "Delete?", th: "ลบ?" },
  // ---- confirmation dialogs for consequential actions -------------------
  // Every button that writes to the hospital, wipes local work, or ends the
  // session is gated by ConfirmDialog; these are its strings.
  "confirm.working":  { en: "Working…", th: "กำลังดำเนินการ…" },
  // reopen / unapprove — reverses a hospital write-back
  "confirm.reopen.title": { en: "Reopen this case?", th: "เปิดเคสนี้ใหม่?" },
  "confirm.reopen.body": {
    en: "Reopening {patientName}'s case removes its Finished status and sends the case back for editing. The codes already written to iMed are withdrawn. This action is logged.",
    th: "การเปิดเคสของ {patientName} ใหม่จะยกเลิกสถานะเสร็จสิ้น และส่งเคสกลับไปแก้ไข รหัสที่บันทึกลง iMed แล้วจะถูกเพิกถอน การกระทำนี้จะถูกบันทึกไว้",
  },
  "confirm.reopen.confirm": { en: "Yes, reopen", th: "ใช่ เปิดใหม่" },
  "confirm.unapprove.title": { en: "Undo this approval?", th: "ยกเลิกการอนุมัติ?" },
  "confirm.unapprove.body": {
    en: "This withdraws the codes already approved for {patientName} and returns the case for editing. This action is logged.",
    th: "การดำเนินการนี้จะเพิกถอนรหัสที่อนุมัติไว้แล้วสำหรับ {patientName} และส่งเคสกลับไปแก้ไข การกระทำนี้จะถูกบันทึกไว้",
  },
  // iMed sync — pulls fresh hospital data over the current dashboard
  "confirm.sync.title": { en: "Sync from iMed?", th: "ซิงค์ข้อมูลจาก iMed?" },
  "confirm.sync.bodyAll": {
    en: "This pulls every available visit from the hospital system and refreshes the dashboard. Cases you have not approved yet are reloaded from iMed.",
    th: "ระบบจะดึงข้อมูลการเข้ารับบริการทั้งหมดจากระบบโรงพยาบาล และรีเฟรชแดชบอร์ด เคสที่ยังไม่ได้อนุมัติจะถูกโหลดใหม่จาก iMed",
  },
  "confirm.sync.bodyWindow": {
    en: "This pulls visits for {window} from the hospital system and refreshes the dashboard. Cases you have not approved yet are reloaded from iMed.",
    th: "ระบบจะดึงข้อมูลการเข้ารับบริการช่วง {window} จากระบบโรงพยาบาล และรีเฟรชแดชบอร์ด เคสที่ยังไม่ได้อนุมัติจะถูกโหลดใหม่จาก iMed",
  },
  "confirm.sync.confirm": { en: "Sync now", th: "ซิงค์เลย" },
  // Settings → reset demo — reopens every approved case at once
  "confirm.reset.title": { en: "Reset the demo?", th: "รีเซ็ตเดโม?" },
  "confirm.reset.body": {
    en: "Every approved case ({n}) is reopened and returned to its original tab, and the codes written back to iMed are withdrawn. This cannot be undone.",
    th: "เคสที่อนุมัติแล้วทั้งหมด ({n} เคส) จะถูกเปิดใหม่และย้ายกลับไปยังแท็บเดิม และรหัสที่บันทึกกลับไปยัง iMed จะถูกเพิกถอน ไม่สามารถย้อนกลับได้",
  },
  "confirm.reset.confirm": { en: "Reset demo", th: "รีเซ็ตเดโม" },
  // logout — a held case lock and unsaved code edits go with it
  "confirm.logout.title": { en: "Log out?", th: "ออกจากระบบ?" },
  "confirm.logout.body": {
    en: "You will be returned to the login screen. Any case you have open is released and code edits that were not approved are not kept.",
    th: "ระบบจะพากลับไปยังหน้าเข้าสู่ระบบ เคสที่คุณเปิดค้างไว้จะถูกปลดล็อก และการแก้ไขรหัสที่ยังไม่ได้อนุมัติจะไม่ถูกบันทึก",
  },
  "confirm.logout.confirm": { en: "Log out", th: "ออกจากระบบ" },
  // Agent → learned rules
  "confirm.forgetRule.title": { en: "Forget this rule?", th: "ลบกฎนี้?" },
  "confirm.forgetRule.body": {
    en: "The AI stops applying this rule to future suggestions. It is deleted permanently and cannot be restored.",
    th: "AI จะหยุดใช้กฎนี้กับคำแนะนำในอนาคต กฎจะถูกลบถาวรและไม่สามารถกู้คืนได้",
  },
  "confirm.forgetRule.confirm": { en: "Forget", th: "ลบ" },
  // activity log → undo
  "confirm.undo.title": { en: "Undo this action?", th: "ยกเลิกการกระทำนี้?" },
  "confirm.undo.body": {
    en: "This reverses \u201c{action}\u201d. If it was an approval, the codes are withdrawn from iMed and the case returns to its queue.",
    th: "ระบบจะย้อนกลับ \u201c{action}\u201d หากเป็นการอนุมัติ รหัสจะถูกเพิกถอนจาก iMed และเคสจะกลับไปยังคิวเดิม",
  },
  "confirm.undo.confirm": { en: "Undo", th: "ยกเลิก" },
  "agent.searched.icd10":  { en: "Searched ICD-10 references only", th: "ค้นหาจากเอกสาร ICD-10 เท่านั้น" },
  "agent.searched.icd9cm": { en: "Searched ICD-9 references only", th: "ค้นหาจากเอกสาร ICD-9 เท่านั้น" },
  // in-case AI dock (CaseAgentDock) — the agent floating on a case detail page
  "dock.title":        { en: "AI Agent", th: "AI ผู้ช่วย" },
  "dock.subtitle":     { en: "Grounded in this case", th: "อ้างอิงข้อมูลจากเคสนี้" },
  "dock.ask":          { en: "Ask AI", th: "ถาม AI" },
  "dock.mode.dict":    { en: "Dictionary", th: "พจนานุกรม" },
  "dock.mode.learn":   { en: "Suggest & Learn", th: "แนะนำรหัส" },
  "dock.welcome.dict":  { en: "Ask about any code on this case — I can see the record and the codes already on it, and I answer from your hospital's references.", th: "ถามเกี่ยวกับรหัสใดก็ได้ในเคสนี้ — ฉันเห็นเวชระเบียนและรหัสที่มีอยู่แล้ว และตอบจากเอกสารอ้างอิงของโรงพยาบาลคุณ" },
  "dock.welcome.learn": { en: "Describe this patient's picture and I'll suggest codes — or type a coding rule the way you'd explain it to a new coder. I'll show you what I understood before anything is saved.", th: "อธิบายอาการของผู้ป่วยรายนี้แล้วฉันจะแนะนำรหัส — หรือพิมพ์กฎการให้รหัสเหมือนที่คุณอธิบายให้เพื่อนร่วมงานใหม่ฟัง ฉันจะแสดงสิ่งที่เข้าใจให้ดูก่อนบันทึก" },
  "dock.placeholder.dict":  { en: "Ask about this case…", th: "ถามเกี่ยวกับเคสนี้…" },
  "dock.placeholder.learn": { en: "Ask about this case, or teach me a rule…", th: "ถามเกี่ยวกับเคสนี้ หรือสอนกฎให้ฉัน…" },
  "dock.send":         { en: "Send", th: "ส่ง" },
  "dock.stop":         { en: "Stop generating", th: "หยุดสร้างคำตอบ" },
  "dock.copy":         { en: "Copy answer", th: "คัดลอกคำตอบ" },
  "dock.new":          { en: "New question", th: "คำถามใหม่" },
  "dock.close":        { en: "Close", th: "ปิด" },
  "dock.openFull":     { en: "Open the full AI Agent page", th: "เปิดหน้า AI ผู้ช่วยแบบเต็ม" },
  "dock.toRail":       { en: "Expand to side panel", th: "ขยายเป็นแผงด้านข้าง" },
  "dock.toFloat":      { en: "Shrink to floating card", th: "ย่อเป็นการ์ดลอย" },
  "dock.resize":       { en: "Resize the panel", th: "ปรับขนาดแผง" },
  "dock.move":         { en: "Drag to move — double-click to reset", th: "ลากเพื่อย้าย — ดับเบิลคลิกเพื่อคืนตำแหน่งเดิม" },
  "dock.ctx.on":       { en: "The agent can see this case — click to ask without it", th: "AI เห็นข้อมูลเคสนี้ — คลิกเพื่อถามโดยไม่ใช้ข้อมูลเคส" },
  "dock.ctx.off":      { en: "Asking without this case — click to include it", th: "กำลังถามโดยไม่ใช้ข้อมูลเคส — คลิกเพื่อรวมข้อมูลเคส" },
  "dock.disclaimer":   { en: "Suggestions only — the coder approves the codes.", th: "เป็นเพียงคำแนะนำ — ผู้ให้รหัสเป็นผู้อนุมัติ" },
  "dock.chip.check":     { en: "Is {code} correct for this case?", th: "รหัส {code} ถูกต้องสำหรับเคสนี้หรือไม่?" },
  "dock.chip.checkProc": { en: "Is {code} the right procedure code here?", th: "รหัสหัตถการ {code} เหมาะกับเคสนี้หรือไม่?" },
  "dock.chip.needProc":  { en: "Does this case need an ICD-9 procedure code?", th: "เคสนี้ต้องมีรหัสหัตถการ ICD-9 หรือไม่?" },
  "dock.chip.principal": { en: "Which diagnosis should be the principal one here?", th: "การวินิจฉัยใดควรเป็นโรคหลักของเคสนี้?" },
  "dock.chip.suggest":   { en: "Which ICD-10 codes fit this record?", th: "รหัส ICD-10 ใดเหมาะกับเวชระเบียนนี้?" },
  // Suggest & Learn starters are TEMPLATES — they land in the composer to be
  // edited, never sent on one tap, so they read as a sentence to finish.
  "dock.chip.teachPrincipal": { en: "For a case like this, always code {code} as principal because…", th: "เคสแบบนี้ ให้ลง {code} เป็นรหัสหลักเสมอ เพราะ…" },
  "dock.chip.teachProc":      { en: "For this procedure, always code {code} because…", th: "หัตถการนี้ ให้ลงรหัส {code} เสมอ เพราะ…" },
  "dock.chip.teachExample":   { en: "For a case like this, always code … as principal, and do not code …", th: "เคสแบบนี้ ให้ลง … เป็นรหัสหลัก และไม่ต้องลง …" },
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
