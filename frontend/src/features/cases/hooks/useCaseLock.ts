import { useEffect, useState } from 'react'
import { acquireCaseLock, releaseCaseLock } from '../api/casesService'
import { API_BASE_URL } from '../../../config/env'

/**
 * One coder per case: acquire the case's working lock on mount, keep it alive
 * with a 30s heartbeat, release it on unmount. When another coder already
 * holds the case the hook reports `held` + who, and the route renders a lock
 * screen instead of the editor.
 *
 * Failure posture is fail-open: if the lock endpoint itself is unreachable
 * (older backend, network blip) the page still opens — locking protects
 * against double work, it must never block work outright. A tab that dies
 * without releasing is covered server-side: an unrenewed lease expires in
 * ~90s.
 */

export type CaseLockStatus = 'acquiring' | 'mine' | 'held'

const HEARTBEAT_MS = 30_000

export function useCaseLock(id: string | undefined): {
  status: CaseLockStatus
  holder: { name: string; email: string } | null
} {
  const [status, setStatus] = useState<CaseLockStatus>('acquiring')
  const [holder, setHolder] = useState<{ name: string; email: string } | null>(
    null,
  )

  useEffect(() => {
    if (!id) return
    let cancelled = false
    let heartbeat: number | undefined
    let haveLock = false

    const apply = (acquired: boolean, who: { name: string; email: string }) => {
      if (cancelled) return
      haveLock = acquired
      setStatus(acquired ? 'mine' : 'held')
      setHolder(who)
      if (!acquired && heartbeat !== undefined) {
        clearInterval(heartbeat) // lost the lease (e.g. laptop slept past TTL)
        heartbeat = undefined
      }
    }

    acquireCaseLock(id)
      .then((lock) => {
        apply(lock.acquired, lock.holder)
        if (lock.acquired && !cancelled) {
          heartbeat = window.setInterval(() => {
            acquireCaseLock(id)
              .then((l) => apply(l.acquired, l.holder))
              .catch(() => undefined) // transient failure: TTL still covers us
          }, HEARTBEAT_MS)
        }
      })
      .catch((err) => {
        console.warn('case lock unavailable — opening unlocked', err)
        if (!cancelled) setStatus('mine')
      })

    // Tab/window closing skips React cleanup — fire a keepalive release so
    // the case frees instantly instead of waiting out the server TTL.
    const onPageHide = () => {
      if (!haveLock) return
      const token = localStorage.getItem('token')
      void fetch(`${API_BASE_URL}/cases/${encodeURIComponent(id)}/lock`, {
        method: 'DELETE',
        keepalive: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => undefined)
    }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      cancelled = true
      if (heartbeat !== undefined) clearInterval(heartbeat)
      window.removeEventListener('pagehide', onPageHide)
      if (haveLock) void releaseCaseLock(id).catch(() => undefined)
    }
  }, [id])

  return { status, holder }
}
