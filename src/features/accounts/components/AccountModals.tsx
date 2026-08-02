import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { extractApiError } from '../api/accountService'
import {
  MIN_PASSWORD_LENGTH,
  type Account,
  type CreateAccountInput,
} from '../types/account.types'

const selectClassName =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13px] text-text outline-none transition-colors focus:border-primary'

/** Cheap client-side check only — the backend is the real validator. */
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-[12px] font-semibold text-error">
      {message}
    </p>
  )
}

interface EditAccountModalProps {
  account: Account
  /** Rejects when the server refuses — the modal stays open and shows why. */
  onSubmit: (account: Account) => Promise<void>
  onClose: () => void
}

export function EditAccountModal({
  account,
  onSubmit,
  onClose,
}: EditAccountModalProps) {
  const [form, setForm] = useState({ ...account })
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameError =
    touched && form.name.trim() === '' ? 'Full name is required' : undefined
  const emailError =
    touched && !isEmail(form.email) ? 'Enter a valid email' : undefined
  const valid = form.name.trim() !== '' && isEmail(form.email)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!valid || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({ ...form, name: form.name.trim(), email: form.email.trim() })
    } catch (err) {
      setError(extractApiError(err, 'Could not save the account'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Edit ${account.name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <Input
          id="edit-name"
          label="Full Name"
          value={form.name}
          error={nameError}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          id="edit-email"
          type="email"
          label="Email"
          value={form.email}
          error={emailError}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />

        {error && <FormError message={error} />}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface NewAccountModalProps {
  /** Rejects when the server refuses (duplicate email, weak password, …) —
   *  the modal stays open with the typed values and shows the message. */
  onSubmit: (input: CreateAccountInput) => Promise<void>
  onClose: () => void
}

export function NewAccountModal({ onSubmit, onClose }: NewAccountModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameError =
    touched && name.trim() === '' ? 'Full name is required' : undefined
  const emailError = touched && !isEmail(email) ? 'Enter a valid email' : undefined
  const passwordError =
    touched && password.length < MIN_PASSWORD_LENGTH
      ? `At least ${MIN_PASSWORD_LENGTH} characters`
      : undefined
  const valid =
    name.trim() !== '' && isEmail(email) && password.length >= MIN_PASSWORD_LENGTH

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!valid || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      // password is sent exactly as typed — trimming it would silently change
      // the credential the coder was given
      await onSubmit({ name: name.trim(), email: email.trim(), password })
    } catch (err) {
      setError(extractApiError(err, 'Could not create the account'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="New Account" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <Input
          id="new-name"
          label="Full Name"
          value={name}
          autoFocus
          error={nameError}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          id="new-email"
          type="email"
          label="Email"
          value={email}
          error={emailError}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <label
            htmlFor="new-password"
            className="mb-1.5 block text-[12px] font-semibold text-muted"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={passwordError ? true : undefined}
              className={`${selectClassName} pr-10 ${
                passwordError ? 'border-error' : ''
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              aria-pressed={showPw}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-text"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p
            className={`mt-1 text-[12px] ${
              passwordError ? 'font-semibold text-error' : 'text-muted'
            }`}
          >
            {passwordError ?? `At least ${MIN_PASSWORD_LENGTH} characters`}
          </p>
        </div>

        {error && <FormError message={error} />}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Account'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
