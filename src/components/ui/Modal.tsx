import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

export interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  className?: string
}

export function Modal({ title, children, onClose, className }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'w-full max-w-md rounded-xl border border-border bg-surface shadow-card',
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h3 id="modal-title" className="text-[15px] font-bold text-text">
            {title}
          </h3>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  variant?: 'primary' | 'danger'
  /** Request in flight — locks both buttons so it can't be fired twice. */
  busy?: boolean
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  variant = 'danger',
  busy = false,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-5 text-[13px] leading-relaxed text-muted">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
