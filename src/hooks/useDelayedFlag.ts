// ============================================================
// True only once `active` has been true for `delayMs`.
//
// For loading UI that is worth showing when a wait is real and
// worth hiding when it isn't. A splash that appears for 80ms
// reads as a glitch, so the router deliberately rendered nothing
// during the token check. This keeps that behaviour for a fast
// check and still gives a slow one something to look at.
// ============================================================
import { useEffect, useState } from 'react'

export function useDelayedFlag(active: boolean, delayMs = 250): boolean {
  const [elapsed, setElapsed] = useState(false)

  useEffect(() => {
    if (!active) return
    const id = window.setTimeout(() => setElapsed(true), delayMs)
    // Clearing on the way out also re-arms the delay, so a second wait gets
    // its own grace period instead of flashing instantly.
    return () => {
      window.clearTimeout(id)
      setElapsed(false)
    }
  }, [active, delayMs])

  // Gated on `active` as well as the timer: when the wait ends the answer is
  // false on that same render, without waiting for the cleanup to land.
  return active && elapsed
}
