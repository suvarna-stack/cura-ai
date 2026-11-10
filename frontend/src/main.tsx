import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './index.css'

// One-time scrub of case-state keys from the era when approvals/logs/edits
// were persisted in localStorage. Case state is now in-memory + server only
// (stale browser copies contradicted the DB after wipes); prefs (theme,
// lang, view) and the auth token still persist by design.
const LEGACY_KEYS = ['approvedCases', 'reopenedCases', 'audit_activity_logs', 'audit_activity_logs_v2']
const LEGACY_PREFIXES = ['codeEdits:', 'reportDraft:', 'aiConfidence:']
try {
  for (const key of Object.keys(localStorage)) {
    if (LEGACY_KEYS.includes(key) || LEGACY_PREFIXES.some(p => key.startsWith(p))) {
      localStorage.removeItem(key)
    }
  }
} catch { /* private mode */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
