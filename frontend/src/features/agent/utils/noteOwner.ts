import type { AuthUser } from '../../auth/types/auth.types'
import type { LearnedNote } from '../types/agent.types'

/**
 * Who may change a taught rule.
 *
 * Learned rules are a shared knowledge layer, so every coder reads the whole
 * list — but a rule is the work of the coder who taught it, and editing,
 * muting or deleting one is theirs alone. An admin may act on any rule: a
 * wrong rule taught by a coder who has since left still has to be removable.
 *
 * The server enforces this (403 from /api/agent/learn/**); this only decides
 * whether the UI offers the buttons, so a coder is never shown a control that
 * will fail. Keep the two rules in step — `AgentLearnController.mayManage`.
 */
export function canManageNote(
  note: LearnedNote,
  user: AuthUser | null,
): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (typeof note.created_by_id === 'number') {
    return note.created_by_id === user.id
  }
  // Taught before rules carried an author id: all we have is the credited
  // name. A rule crediting nobody belongs to nobody and stays open.
  const owner = note.created_by.trim().toLowerCase()
  return (
    owner === '' ||
    owner === (user.fullName ?? '').trim().toLowerCase() ||
    owner === user.email.trim().toLowerCase()
  )
}
