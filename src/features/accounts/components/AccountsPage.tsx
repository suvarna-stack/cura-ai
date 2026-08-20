import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useEffect, useState } from 'react'
import {
  Pencil,
  Trash2,
  Plus,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { ConfirmModal } from '../../../components/ui/Modal'
import {
  createAccount,
  deleteAccount,
  extractApiError,
  fetchAccounts,
  updateAccount,
} from '../api/accountService'
import type { Account, CreateAccountInput } from '../types/account.types'
import { EditAccountModal, NewAccountModal } from './AccountModals'

/** The list endpoint returns full_name order; keep local edits in that order. */
const byName = (a: Account, b: Account) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export function AccountsPage() {
  useDocumentTitle("Accounts")
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  // Failures the modals can't show themselves (list load, confirm dialogs).
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [toggling, setToggling] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setAccounts(await fetchAccounts())
        setError(null)
      } catch (err) {
        // a dead token is already handled globally by the axios interceptor
        setError(
          extractApiError(err, 'Could not load accounts — is the backend running?'),
        )
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // The modals await these: a rejection keeps the modal open with its message,
  // so the row list only ever shows what the server actually stored.
  const handleCreate = async (input: CreateAccountInput) => {
    const created = await createAccount(input)
    setAccounts((prev) => [...prev, created].sort(byName))
    setError(null)
    setCreating(false)
  }

  const handleEdit = async (next: Account, newPassword?: string) => {
    const saved = await updateAccount(next, newPassword)
    setAccounts((prev) =>
      prev.map((a) => (a.id === saved.id ? saved : a)).sort(byName),
    )
    setError(null)
    setEditing(null)
  }

  const handleToggle = async () => {
    if (!toggling || busy) return
    setBusy(true)
    try {
      const saved = await updateAccount({
        ...toggling,
        status: toggling.status === 'Active' ? 'Inactive' : 'Active',
      })
      setAccounts((prev) => prev.map((a) => (a.id === saved.id ? saved : a)))
      setError(null)
    } catch (err) {
      setError(extractApiError(err, 'Could not update the account'))
    } finally {
      setBusy(false)
      setToggling(null)
    }
  }

  const handleDelete = async () => {
    if (!deleting || busy) return
    setBusy(true)
    try {
      await deleteAccount(deleting.id)
      setAccounts((prev) => prev.filter((a) => a.id !== deleting.id))
      setError(null)
    } catch (err) {
      // 409 = the account has coding history; it is still there, so keep the row
      setError(extractApiError(err, 'Could not delete the account'))
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-[19px] font-bold text-text">Accounts</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={14} /> New Account
        </Button>
      </div>
      <p className="mb-6 text-[12px] text-muted">
        Manage coder access to MedCode AI. Accounts are hospital-wide — a coder
        is not tied to a department.
      </p>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-error/40 bg-error/10 px-4 py-3">
          <p className="flex-1 text-[12px] font-semibold text-error">{error}</p>
          <button
            type="button"
            title="Dismiss"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
            className="text-error/70 transition-colors hover:text-error"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <Card padded={false} className="overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Coder accounts</caption>
            <thead>
              <tr className="border-b border-border text-[12px] tracking-wide text-muted uppercase">
                {['Name', 'Email', 'Status', 'Actions'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-5 py-3 font-semibold whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(loading || accounts.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-[13px] text-muted">
                    {loading ? 'Loading accounts…' : 'No accounts yet.'}
                  </td>
                </tr>
              )}
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-5 py-3 text-[13px] font-semibold whitespace-nowrap text-text">
                    {a.name}
                  </td>
                  <td className="px-5 py-3 text-[13px] whitespace-nowrap text-muted">
                    {a.email}
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      variant={a.status === 'Active' ? 'success' : 'neutral'}
                    >
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title="Edit"
                        aria-label={`Edit ${a.name}`}
                        onClick={() => setEditing(a)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-text"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title={
                          a.status === 'Active' ? 'Deactivate' : 'Activate'
                        }
                        aria-label={`${a.status === 'Active' ? 'Deactivate' : 'Activate'} ${a.name}`}
                        onClick={() => setToggling(a)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-text"
                      >
                        {a.status === 'Active' ? (
                          <ToggleRight size={15} className="text-success" />
                        ) : (
                          <ToggleLeft size={15} />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        aria-label={`Delete ${a.name}`}
                        onClick={() => setDeleting(a)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/15"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <EditAccountModal
          account={editing}
          onSubmit={handleEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {toggling && (
        <ConfirmModal
          title={
            toggling.status === 'Active'
              ? 'Deactivate account'
              : 'Activate account'
          }
          message={
            toggling.status === 'Active'
              ? `Deactivate ${toggling.name}? They will lose access immediately.`
              : `Reactivate ${toggling.name}? They will regain access to MedCode AI.`
          }
          confirmLabel={
            toggling.status === 'Active' ? 'Deactivate' : 'Activate'
          }
          variant="primary"
          busy={busy}
          onConfirm={() => void handleToggle()}
          onClose={() => !busy && setToggling(null)}
        />
      )}

      {deleting && (
        <ConfirmModal
          title="Delete account"
          message={`Delete ${deleting.name}'s account? This cannot be undone. An account that has already coded cases cannot be deleted — deactivate it instead.`}
          confirmLabel="Delete"
          variant="danger"
          busy={busy}
          onConfirm={() => void handleDelete()}
          onClose={() => !busy && setDeleting(null)}
        />
      )}

      {creating && (
        <NewAccountModal
          onSubmit={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  )
}
