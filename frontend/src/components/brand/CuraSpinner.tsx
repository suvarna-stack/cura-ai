// ============================================================
// CuraSpinner — the layered-C mark in motion.
//
// Each ring is its own <g> spinning on the same origin at a
// different speed and direction; the heart beats on its own
// clock. That counter-rotation is the whole idea, so the rings
// never lock into a single rigid wheel.
//
// Variants match the handoff's placement table exactly — pick by
// where it goes, not by pixel size, and the timings/colors that
// belong to that context come with it.
//
// Reduced motion needs no special case here: the global block in
// index.css collapses every duration to 0.01ms, which parks each
// ring on rotate(360deg) — indistinguishable from rest. The
// role="status" label is what a reduced-motion or screen-reader
// user relies on, so it is never optional.
// ============================================================
import { useId } from 'react'
import {
  CURA_COLOR,
  CURA_EASE,
  CURA_PATHS,
  CURA_RING_OPACITY,
  CURA_VIEWBOX,
} from './curaPaths'

export type CuraSpinnerVariant = 'splash' | 'inline' | 'label' | 'button'

type RingSpec = {
  path: string
  width: number
  opacity: number
  duration: number
  direction: 'cw' | 'ccw'
}

type VariantSpec = {
  size: number
  rings: RingSpec[]
  /** Omitted on the small variants — a heart under ~24px reads as a smudge. */
  heart: boolean
  heartDuration: number
  /** Rings ease organically at large sizes, linearly when small and fast. */
  ease: string
  /** Flat stroke color; when absent the vertical brand gradient is used. */
  flat?: string
}

// Sizes, widths, durations and colors below are the handoff's numbers.
const VARIANTS: Record<CuraSpinnerVariant, VariantSpec> = {
  // App boot / route-level suspense.
  splash: {
    size: 104,
    heart: true,
    heartDuration: 1.4,
    ease: CURA_EASE,
    rings: [
      { path: CURA_PATHS.outer, width: 9, opacity: CURA_RING_OPACITY.outer, duration: 2.4, direction: 'cw' },
      { path: CURA_PATHS.middle, width: 8, opacity: CURA_RING_OPACITY.middle, duration: 1.8, direction: 'ccw' },
      { path: CURA_PATHS.inner, width: 7, opacity: CURA_RING_OPACITY.inner, duration: 1.3, direction: 'cw' },
    ],
  },
  // Section loads, next to a line of mono text.
  inline: {
    size: 28,
    heart: true,
    heartDuration: 1.4,
    ease: CURA_EASE,
    rings: [
      { path: CURA_PATHS.outer, width: 9, opacity: CURA_RING_OPACITY.outer, duration: 1.6, direction: 'cw' },
      { path: CURA_PATHS.middle, width: 8, opacity: CURA_RING_OPACITY.middle, duration: 1.2, direction: 'ccw' },
      { path: CURA_PATHS.inner, width: 7, opacity: CURA_RING_OPACITY.inner, duration: 1.0, direction: 'cw' },
    ],
  },
  // Secondary button / header action, e.g. "Syncing with iMed".
  label: {
    size: 20,
    heart: false,
    heartDuration: 1.4,
    ease: 'linear',
    flat: CURA_COLOR.ink,
    rings: [
      { path: CURA_PATHS.outer, width: 10, opacity: 1, duration: 1.4, direction: 'cw' },
      { path: CURA_PATHS.middle, width: 9, opacity: 0.5, duration: 1.0, direction: 'ccw' },
    ],
  },
  // Inside a filled primary button, e.g. "Approving…".
  // One ring only: below ~18px the inner two collapse into noise.
  button: {
    size: 16,
    heart: false,
    heartDuration: 1.4,
    ease: 'linear',
    flat: CURA_COLOR.onBrand,
    rings: [
      { path: CURA_PATHS.outer, width: 12, opacity: 1, duration: 1, direction: 'cw' },
    ],
  },
}

export type CuraSpinnerProps = {
  variant?: CuraSpinnerVariant
  /** Override the variant's size. Stroke widths are not rescaled — see note. */
  size?: number
  /** Switch to the on-dark palette (flat mint rings, off-white heart). */
  tone?: 'light' | 'dark'
  /** Announced to assistive tech. Say what is loading, not "loading". */
  label: string
  className?: string
}

export function CuraSpinner({
  variant = 'splash',
  size,
  tone = 'light',
  label,
  className = '',
}: CuraSpinnerProps) {
  // A gradient id must be unique per instance or a second spinner on the page
  // silently adopts the first one's def — and disappears when that one unmounts.
  const gradientId = `cura-grad-${useId()}`
  const spec = VARIANTS[variant]
  const px = size ?? spec.size

  const dark = tone === 'dark'
  const ringColor = dark
    ? CURA_COLOR.onDarkRing
    : (spec.flat ?? `url(#${gradientId})`)
  const heartColor = dark ? CURA_COLOR.onDarkHeart : CURA_COLOR.heart
  const needsGradient = !dark && !spec.flat

  return (
    <span role="status" aria-live="polite" className={`inline-flex ${className}`}>
      <svg
        width={px}
        height={px}
        viewBox={CURA_VIEWBOX}
        aria-hidden="true"
        focusable="false"
      >
        {needsGradient && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={CURA_COLOR.gradientFrom} />
              <stop offset="1" stopColor={CURA_COLOR.gradientTo} />
            </linearGradient>
          </defs>
        )}

        {spec.rings.map((ring) => (
          <g
            key={ring.path}
            style={{
              transformOrigin: '60px 60px',
              animation: `${ring.direction === 'cw' ? 'spinCW' : 'spinCCW'} ${ring.duration}s ${spec.ease} infinite`,
            }}
          >
            <path
              d={ring.path}
              fill="none"
              stroke={ringColor}
              strokeWidth={ring.width}
              strokeLinecap="round"
              opacity={ring.opacity}
            />
          </g>
        ))}

        {spec.heart && (
          // Its own origin, a touch below centre — the heart sits low in the C.
          <g
            style={{
              transformOrigin: '60px 62px',
              animation: `pulseHeart ${spec.heartDuration}s ease-in-out infinite`,
            }}
          >
            <path d={CURA_PATHS.heart} fill={heartColor} />
          </g>
        )}
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Three dots that blink in sequence, for "Loading case detail···" lines. */
export function CuraDots({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={className}>
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          style={{ animation: `dotBlink 1.4s ${delay}s infinite` }}
        >
          .
        </span>
      ))}
    </span>
  )
}
