// ============================================================
// Dialog accessibility in one hook: initial focus on open, focus
// restore on close, and a keydown handler (Escape closes, Tab is
// trapped inside). Returned handler goes on the dialog element as
// a React onKeyDown so inner widgets (e.g. the code typeahead) can
// stopPropagation an Escape meant only for themselves.
// ============================================================
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// queried live on every Tab — dropdown options mount/unmount while open
function focusablesIn(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  )
}

export function useModalA11y(
  dialogRef: RefObject<HTMLElement | null>,
  {
    onClose,
    initialFocusRef,
    active = true,
  }: {
    onClose: () => void
    initialFocusRef?: RefObject<HTMLElement | null>
    /** For always-mounted hosts (e.g. a slide-in drawer): pass the open flag. */
    active?: boolean
  },
) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // focus into the dialog when it appears, back to the opener when it goes
  useEffect(() => {
    if (!active) return
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = document.activeElement as HTMLElement | null
    const target = initialFocusRef?.current ?? focusablesIn(dialog)[0] ?? dialog
    target.focus()
    return () => {
      if (opener && opener.isConnected) opener.focus()
    }
    // the dialog's open lifetime only — refs are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCloseRef.current()
      return
    }
    if (e.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusables = focusablesIn(dialog)
    if (focusables.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        e.preventDefault()
        last.focus()
      }
    } else if (active === last || !dialog.contains(active)) {
      e.preventDefault()
      first.focus()
    }
  }
}
