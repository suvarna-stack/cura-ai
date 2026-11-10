// ============================================================
// The static Cura AI mark and wordmark.
//
// Same four paths as CuraSpinner, standing still. Kept as inline
// SVG rather than an <img> so the rings can inherit a tone and
// the whole lockup scales with the header's type.
//
// The .svg files in src/assets/brand are the same artwork for
// anywhere a file is needed (favicon, PWA icon, exported docs).
// ============================================================
import { useId } from 'react'
import {
  CURA_COLOR,
  CURA_PATHS,
  CURA_RING_OPACITY,
  CURA_STROKE,
  CURA_VIEWBOX,
} from './curaPaths'

export type CuraTone = 'light' | 'dark'

export function CuraMark({
  size = 20,
  tone = 'light',
  className = '',
}: {
  size?: number
  tone?: CuraTone
  className?: string
}) {
  const gradientId = `cura-mark-${useId()}`
  const dark = tone === 'dark'
  // On dark chrome the mark goes flat mint — a gradient that dark would
  // disappear into the header behind it.
  const stroke = dark ? CURA_COLOR.assetOnDark : `url(#${gradientId})`

  return (
    <svg
      width={size}
      height={size}
      viewBox={CURA_VIEWBOX}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {!dark && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={CURA_COLOR.gradientFrom} />
            <stop offset="1" stopColor={CURA_COLOR.gradientTo} />
          </linearGradient>
        </defs>
      )}
      <path d={CURA_PATHS.outer} fill="none" stroke={stroke}
        strokeWidth={CURA_STROKE.outer} strokeLinecap="round" />
      <path d={CURA_PATHS.middle} fill="none" stroke={stroke}
        strokeWidth={CURA_STROKE.middle} strokeLinecap="round"
        opacity={dark ? 0.55 : CURA_RING_OPACITY.middle} />
      <path d={CURA_PATHS.inner} fill="none" stroke={stroke}
        strokeWidth={CURA_STROKE.inner} strokeLinecap="round"
        opacity={dark ? 0.28 : CURA_RING_OPACITY.inner} />
      <path d={CURA_PATHS.heart}
        fill={dark ? CURA_COLOR.assetOnDark : CURA_COLOR.heart} />
    </svg>
  )
}

/**
 * CURA AI as type. "AI" always carries the lighter green so the two words
 * read as one name with an emphasis, not as two separate labels.
 */
export function CuraWordmark({
  size = 14,
  tone = 'light',
  className = '',
}: {
  size?: number
  tone?: CuraTone
  className?: string
}) {
  const dark = tone === 'dark'
  return (
    <span
      className={`font-brand font-bold uppercase leading-none ${className}`}
      style={{
        fontSize: size,
        letterSpacing: '1.5px',
        color: dark ? '#ffffff' : CURA_COLOR.ink,
      }}
    >
      Cura{' '}
      <span style={{ color: dark ? '#8fd6ac' : CURA_COLOR.gradientFrom }}>
        AI
      </span>
    </span>
  )
}

/** Mark + wordmark, the lockup used in both app headers. */
export function CuraLockup({
  markSize = 20,
  wordSize = 14,
  tone = 'light',
  className = '',
}: {
  markSize?: number
  wordSize?: number
  tone?: CuraTone
  className?: string
}) {
  return (
    <span className={`flex select-none items-center gap-2 ${className}`}>
      <CuraMark size={markSize} tone={tone} />
      <CuraWordmark size={wordSize} tone={tone} />
    </span>
  )
}
