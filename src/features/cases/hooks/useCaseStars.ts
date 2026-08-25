import { useCallback, useState } from 'react'
import { setCaseStar } from '../api/casesService'
import type { CaseStarState } from '../api/casesService'

/** What a row needs to draw its star. */
export interface StarView {
  starred: boolean
  starredBy: string | null
  /** the ACCOUNT that owns it — compared against the logged-in coder to decide
   *  whether this browser may take the star down */
  starredByStamp: string | null
}

/** The star as it arrives on a card or a case detail payload. */
export interface StarSource {
  id: string
  starred?: boolean
  starredBy?: string | null
  starredByStamp?: string | null
}

/**
 * May `me` clear (or move) a star owned by `owner`?
 *
 * The mirror of CaseStarService.mayManage on the server, which is what
 * actually enforces it — this copy exists so the UI can grey the control out
 * instead of offering a click that comes back 403. Matched on the ACCOUNT, not
 * the display name: two coders can share a name, and renaming yourself must
 * not cost you your stars. An unowned star is free for anyone to take.
 */
export function mayManageStar(owner: string | null | undefined, me: string): boolean {
  return !owner || !owner.trim() || owner.toLowerCase() === me.toLowerCase()
}

/**
 * The shared case star, from the list's point of view.
 *
 * The server owns the value — it arrives on every card in `GET /api/cases` and
 * is the same for every coder. This hook only holds the OVERRIDES made in this
 * browser since the last fetch, so a click shows instantly and the payload
 * stays the source of truth for everything not clicked here. A failed write
 * drops its override, which snaps the row back to what the server last said —
 * including a 403 from starring or unstarring a colleague's star, which the
 * disabled control should already have prevented.
 *
 * No refetch on success on purpose: rebuilding the whole dashboard payload
 * (and losing the coder's scroll position and page) to redraw one star the
 * override already shows would be a bad trade.
 *
 * @param me     display name to stamp an optimistic star with
 * @param myStamp the logged-in ACCOUNT — decides what this browser may clear
 */
export function useCaseStars(me: string, myStamp: string) {
  const [overrides, setOverrides] = useState<Map<string, StarView>>(new Map())

  const put = (id: string, v: StarView | null) =>
    setOverrides(prev => {
      const n = new Map(prev)
      if (v) n.set(id, v)
      else n.delete(id)
      return n
    })

  /** The star to render: this browser's override, else the server's card. */
  const starOf = useCallback(
    (c: StarSource): StarView =>
      overrides.get(c.id) ?? {
        starred: c.starred ?? false,
        starredBy: c.starredBy ?? null,
        starredByStamp: c.starredByStamp ?? null,
      },
    [overrides],
  )

  /** False when the star on this case belongs to another coder — the control
   *  renders read-only rather than offering a click the server will refuse. */
  const canToggle = useCallback(
    (c: StarSource) => mayManageStar(starOf(c).starredByStamp, myStamp),
    [starOf, myStamp],
  )

  /** Flip the star, optimistically. `me` stands in for the display name the
   *  server will stamp; the response replaces it as soon as it lands. */
  const toggleStar = useCallback(
    (c: StarSource) => {
      const view = starOf(c)
      // belt and braces: the button is disabled for someone else's star, but
      // a keyboard or a stale render must not fire a doomed request either
      if (!mayManageStar(view.starredByStamp, myStamp)) return view.starred
      const next = !view.starred
      put(c.id, {
        starred: next,
        starredBy: next ? me : null,
        starredByStamp: next ? myStamp : null,
      })
      void setCaseStar(c.id, next).then((s: CaseStarState | null) => {
        if (!s) put(c.id, null) // write failed — back to the server's value
        else put(c.id, {
          starred: s.starred,
          starredBy: s.starredBy,
          starredByStamp: s.starredByStamp,
        })
      })
      return next
    },
    [starOf, me, myStamp],
  )

  return { starOf, canToggle, toggleStar }
}
