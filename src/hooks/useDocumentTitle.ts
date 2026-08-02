// ============================================================
// Per-route browser-tab titles (WCAG 2.4.2) — every page was
// shipping the Vite scaffold's "coder-webapp".
// ============================================================
import { useEffect } from 'react'

const SUFFIX = 'MedCode AI'

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} — ${SUFFIX}`
    return () => {
      document.title = previous
    }
  }, [title])
}
