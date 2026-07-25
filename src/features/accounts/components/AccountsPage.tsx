import { useEffect, useState } from 'react'
import {
  Pencil,
  Trash2,
  Plus,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { ConfirmModal } from '../../../components/ui/Modal'
import {
  createAccount,
  deleteAccount,
  fetchAccounts,
  updateAccount,
} from '../api/accountService'
import type { Account } from '../types/account.types'
import { EditAccountModal, NewAccountModal } from './AccountModals'

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [editing, setEditing] = useState<Account | null>(null)
  const [toggling, setToggling] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setAccounts(await fetchAccounts())
      } catch {
        // 401/network — the axios interceptor handles dead tokens
      }
    })()
  }, [])

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

      <Card padded={false} className="overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[11px] tracking-wide text-muted uppercase">
                {['Name', 'Email', 'Status', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 font-semibold whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
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
          onSave={(next) => {
            setAccounts((prev) =>
              prev.map((a) => (a.id === next.id ? next : a)),
            )
            void updateAccount(next).catch(() => {
              /* placeholder until backend exists */
            })
            setEditing(null)
          }}
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
          onConfirm={() => {
            const next: Account = {
              ...toggling,
              status: toggling.status === 'Active' ? 'Inactive' : 'Active',
            }
            setAccounts((prev) =>
              prev.map((a) => (a.id === next.id ? next : a)),
            )
            void updateAccount(next).catch(() => {
              /* placeholder */
            })
            setToggling(null)
          }}
          onClose={() => setToggling(null)}
        />
      )}

      {deleting && (
        <ConfirmModal
          title="Delete account"
          message={`Delete ${deleting.name}'s account? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            setAccounts((prev) => prev.filter((a) => a.id !== deleting.id))
            void deleteAccount(deleting.id).catch(() => {
              /* placeholder */
            })
            setDeleting(null)
          }}
          onClose={() => setDeleting(null)}
        />
      )}

      {creating && (
        <NewAccountModal
          onCreate={(input) => {
            const created: Account = {
              id: `a${Date.now()}`,
              name: input.name,
              email: input.email,
              status: 'Active',
            }
            setAccounts((prev) => [...prev, created])
            void createAccount(input).catch(() => {
              /* placeholder */
            })
            setCreating(false)
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  )
}
