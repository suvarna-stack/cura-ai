import { useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { useModalA11y } from '../../hooks/useModalA11y'

export interface ModalShellProps {
  children: ReactNode
  onClose: () => void
  /** accessible name — pass exactly one of ariaLabel / ariaLabelledBy */
  ariaLabel?: string
  ariaLabelledBy?: string
  className?: string
  style?: CSSProperties
  overlayClassName?: string
  overlayStyle?: CSSProperties
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

/**
 * Bare accessible dialog: overlay + role="dialog" + Escape-to-close +
 * focus trap + focus restore. Carries no visual opinion of its own, so
 * the glassmorphism overlays can keep their exact styling.
 */
export function ModalShell({
  children,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  className,
  style,
  overlayClassName = 'p-4',
  overlayStyle,
  initialFocusRef,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onKeyDown = useModalA11y(dialogRef, { onClose, initialFocusRef })
  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center', overlayClassName)}
      style={overlayStyle}
      onClick={onClose}
      role="presentation"
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape/Tab handling on the dialog container is the APG dialog pattern */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={className}
        style={style}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  )
}

export interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  className?: string
}

export function Modal({ title, children, onClose, className }: ModalProps) {
  const titleId = useId()
  return (
    <ModalShell
      onClose={onClose}
      ariaLabelledBy={titleId}
      overlayClassName="bg-overlay p-4"
      className={cn(
        'w-full max-w-md rounded-xl border border-border bg-surface shadow-card',
        className,
      )}
    >
      <div className="border-b border-border px-5 py-4">
        <h3 id={titleId} className="text-[15px] font-bold text-text">
          {title}
        </h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </ModalShell>
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
