/**
 * Bare "teach my previous message" commands — "learn that", "remember it",
 * Thai "จำไว้" — sent as a follow-up after the agent answered. The thing to
 * teach is the claim the coder made earlier, not the two-word command itself,
 * so callers use this both to spot the command AND to skip past it when
 * hunting backwards for the sentence it refers to.
 */
const LEARN_BACK_RE =
  /^(please\s+)?(learn|remember|save|note)(\s+(that|this|it))?\s*[.!]*$/i
const LEARN_BACK_TH_RE =
  /^(ช่วย)?(จำ|จดจำ|เรียนรู้|บันทึก|สอน)(ไว้|อันนี้|สิ่งนี้|เลย)?(ด้วย)?(นะ|สิ|ครับ|ค่ะ|คะ)?$/

export function isLearnBack(text: string): boolean {
  const s = text.trim()
  return LEARN_BACK_RE.test(s) || LEARN_BACK_TH_RE.test(s)
}
