import type { CSSProperties } from 'react'

export type ThemeId = 'light-rose' | 'dark-rose' | 'light-green' | 'mono'

export type GL = {
  card: string
  row: string
  sidebar: string
  /** OPAQUE surface for popovers/menus — see ThemeContext */
  popover: string
  blur20: string
  blur24: string
  blur16: string
  border: string
  borderSm: string
  shadow: string
  shadowSm: string
  text: string
  muted: string
  accent: string
  accentGrad: string
  accentRgb: string
  success: string
  warning: string
  danger: string
  info: string
  headerBg: string
  inputBg: string
  sidebarBorder: string
  isDark: boolean
}

export type ThemeConfig = {
  label: string
  preview: string[]
  bg: CSSProperties
  gl: GL
}
