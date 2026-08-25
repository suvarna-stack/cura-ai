import { useCallback, useState } from 'react'
import { setCaseStar } from '../api/casesService'
import type { CaseStarState } from '../api/casesService'

/** What a row needs to draw its star. */
export interface StarView {
  starred: boolean
  starredBy: string | null
}

/**
 * The shared case star, from the list's point of view.
 *
 * The server owns the value — it arrives on every card in `GET /api/cases` and
 * is the same for every coder. This hook only holds the OVERRIDES made in this
 * browser since the last fetch, so a click shows instantly and the payload
 * stays the source of truth for everything not clicked here. A failed write
 * drops its override, which snaps the row back to what the server last said.
 *
 * No refetch on success on purpose: rebuilding the whole dashboard payload
 * (and losing the coder's scroll position and page) to redraw one star the
 * override already shows would be a bad trade.
 */
export function useCaseStars(me: string) {
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
    (c: { id: string; starred?: boolean; starredBy?: string | null }): StarView =>
      overrides.get(c.id) ?? {
        starred: c.starred ?? false,
        starredBy: c.starredBy ?? null,
      },
    [overrides],
  )

  /** Flip the star, optimistically. `me` stands in for the display name the
   *  server will stamp; the response replaces it as soon as it lands. */
  const toggleStar = useCallback(
    (c: { id: string; starred?: boolean; starredBy?: string | null }) => {
      const next = !(overrides.get(c.id)?.starred ?? c.starred ?? false)
      put(c.id, { starred: next, starredBy: next ? me : null })
      void setCaseStar(c.id, next).then((s: CaseStarState | null) => {
        if (!s) put(c.id, null) // write failed — back to the server's value
        else put(c.id, { starred: s.starred, starredBy: s.starredBy })
      })
      return next
    },
    [overrides, me],
  )

  return { starOf, toggleStar }
}
