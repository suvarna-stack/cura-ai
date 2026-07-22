import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import type { Account, Role } from '../types/account.types'

const selectClassName =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13px] text-text outline-none transition-colors focus:border-primary'

interface EditAccountModalProps {
  account: Account
  onSave: (account: Account) => void
  onClose: () => void
}

export function EditAccountModal({
  account,
  onSave,
  onClose,
}: EditAccountModalProps) {
  const [form, setForm] = useState({ ...account })
  const canSave = form.name.trim() !== '' && form.email.trim() !== ''

  return (
    <Modal title={`Edit ${account.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Input
          label="Full Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          type="email"
          label="Email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-muted">
            Role
          </label>
          <select
            className={selectClassName}
            value={form.role}
            onChange={(e) =>
              setForm((f) => ({ ...f, role: e.target.value as Role }))
            }
          >
            <option>Coder</option>
            <option>Senior Coder</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={() => onSave(form)}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  )
}

interface NewAccountModalProps {
  onCreate: (input: {
    name: string
    email: string
    role: Role
    password: string
  }) => void
  onClose: () => void
}

export function NewAccountModal({ onCreate, onClose }: NewAccountModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [role, setRole] = useState<Role>('Coder')
  const valid =
    name.trim() !== '' && email.trim() !== '' && password.trim() !== ''

  return (
    <Modal title="New Account" onClose={onClose}>
      <div className="space-y-4">
        <Input
          label="Full Name"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          type="email"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-muted">
            Password
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${selectClassName} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-text"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-muted">
            Role
          </label>
          <select
            className={selectClassName}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option>Coder</option>
            <option>Senior Coder</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              valid &&
              onCreate({
                name: name.trim(),
                email: email.trim(),
                role,
                password: password.trim(),
              })
            }
          >
            Create Account
          </Button>
        </div>
      </div>
    </Modal>
  )
}
