// ============================================================
// The Cura AI layered-C mark, as data.
//
// Three concentric C-arcs around a heart. Every brand surface —
// static logo, spinner, splash — draws these same four paths, so
// the loader is literally the logo in motion rather than a
// separate spinner that happens to sit near it.
//
// Path data and palette are copied verbatim from
// design_handoff_cura_logo_loading/README.md (marked high-fidelity:
// "copy the numbers exactly"). Do not round these.
// ============================================================

/** viewBox every mark shares — scale with width/height only. */
export const CURA_VIEWBOX = '0 0 120 120'

export const CURA_PATHS = {
  outer: 'M90.5 34.2 A40 40 0 1 0 90.5 85.8',
  middle: 'M82.9 40.6 A30 30 0 1 0 82.9 79.4',
  inner: 'M75.3 47.1 A20 20 0 1 0 75.3 72.9',
  heart: 'M60 57.4c-2-4-8-2.7-8 2 0 4 8 8 8 8s8-4 8-8c0-4.7-6-6-8-2Z',
} as const

/** Default ring stroke widths (overridden at small sizes, see CuraSpinner). */
export const CURA_STROKE = { outer: 9, middle: 8, inner: 7 } as const

/** Ring opacities that give the mark its layered depth. */
export const CURA_RING_OPACITY = { outer: 1, middle: 0.6, inner: 0.32 } as const

export const CURA_COLOR = {
  /** Vertical gradient stops for the primary mark on light backgrounds. */
  gradientFrom: '#4FAE84',
  gradientTo: '#1C5A40',
  /** Heart on light backgrounds. */
  heart: '#2E7D5B',
  /** Flat ring + heart for anything sitting on a dark surface. */
  onDarkRing: '#5cbc8e',
  onDarkHeart: '#eaf6ef',
  /** The exported on-dark asset uses a slightly different mint. */
  assetOnDark: '#5FBE92',
  /** Spinner inside a filled brand-green button. */
  onBrand: '#8fd6ac',
  /** Deep brand green for label spinners on light chrome. */
  ink: '#15503a',
} as const

/** Ring easing — deliberately not linear, so the orbit feels organic. */
export const CURA_EASE = 'cubic-bezier(.5,0,.5,1)'
