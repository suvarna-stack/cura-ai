import type { LearnedNote } from '../types/agent.types'

/**
 * One-line form of a taught rule — "post-op fever after appendectomy →
 * T81.4 (not R50.9)". Used for the save receipt and for the text that
 * goes into stored conversation history, where a card cannot be rendered.
 */
export function noteLine(
  note: LearnedNote,
  t: (key: string) => string,
): string {
  const use = note.codes.filter((c) => c.role !== 'exclude').map((c) => c.code)
  const avoid = note.codes.filter((c) => c.role === 'exclude').map((c) => c.code)
  return [
    note.scenario,
    use.length > 0 ? `→ ${use.join(', ')}` : '',
    avoid.length > 0 ? `(${t('agent.learn.not')} ${avoid.join(', ')})` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
