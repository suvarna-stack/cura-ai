import { createContext, useContext, useState } from "react";
import type { ThemeId, ThemeConfig, GL } from "../types/theme.types";

/**
 * themes — The master theme registry.
 *
 * Each key is a ThemeId (e.g. "light-rose", "dark-rose", "light-green", "mono").
 * Each value is a ThemeConfig with two sub-objects:
 *   - `bg`  : CSS background gradient applied to the root container
 *   - `gl`  : Glassmorphism design tokens (colors, blurs, shadows, borders, etc.)
 *
 * To add a new theme, add a new entry here following the same shape.
 */
const themes: Record<ThemeId, ThemeConfig> = {
  // ─── Light Rose ──────────────────────────────────────────────────────────────
  // A soft warm light theme with rose-gold accent color (#C9748A).
  "light-rose": {
    label: "Rose Gold Light",
    // preview: [background, secondary, accent] — used in the theme picker UI
    preview: ["#FDF5F7", "#fce4ec", "#A34D66"],
    bg: {
      // Multi-layer radial gradients for a soft blush halo effect on a light base
      background: `
        radial-gradient(ellipse 65% 55% at 85% 10%, rgba(240,184,196,0.40) 0%, transparent 55%),
        radial-gradient(ellipse 55% 50% at 12% 80%, rgba(201,116,138,0.15) 0%, transparent 55%),
        radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,240,244,0.80) 0%, transparent 65%),
        #FDF5F7`,
    },
    gl: {
      // Glass surface backgrounds (used for cards, rows, sidebar)
      card: "rgba(255,255,255,0.65)", row: "rgba(255,255,255,0.55)", sidebar: "rgba(255,255,255,0.50)",
      // Menus and dropdowns are NOT glass: they float over the very rows they
      // filter, and a translucent panel let that text read straight through it
      // (backdrop-filter does not compose when the sticky bar above already
      // blurs). One opaque surface per theme — blush white.
      popover: "#FFF8FA",
      // Backdrop blur levels for glass layers
      blur20: "blur(20px)", blur24: "blur(24px)", blur16: "blur(16px)",
      // Border tokens — stronger on outer glass, subtler on inner elements
      border: "1px solid rgba(255,255,255,0.90)", borderSm: "1px solid rgba(255,255,255,0.80)",
      // Drop shadows with rose-tinted color
      shadow: "0 4px 20px rgba(180,80,100,0.08)", shadowSm: "0 2px 8px rgba(180,80,100,0.06)",
      // Typography — dark base text; muted at 70% passes 4.5:1 (WCAG 1.4.3;
      // the old 0.50 sat near 3:1)
      text: "#1A0810", muted: "rgba(80,20,40,0.70)",
      // Accent (rose-gold) used AS TEXT for headings/labels/chips, so it must
      // pass 4.5:1 on the blush background — #A34D66 is the same hue, darker
      // (the old #C9748A was ~3.1:1)
      accent: "#A34D66", accentGrad: "#A34D66", accentRgb: "163,77,102",
      // Semantic colors
      success: "#A34D66", warning: "#D97706", danger: "#DC2626", info: "#2563EB",
      // Sticky header + form input backgrounds
      headerBg: "rgba(253,245,247,0.80)", inputBg: "rgba(255,255,255,0.60)",
      sidebarBorder: "1px solid rgba(201,116,138,0.12)",
      // Tag/badge background and border for group labels
      // isDark — controls text contrast logic and icon inversions in components
      isDark: false,
    },
  },

  // ─── Dark Rose ───────────────────────────────────────────────────────────────
  // A deep dark theme with the same rose-gold accent (#C9748A) on a near-black base.
  "dark-rose": {
    label: "Dark Rose Gold",
    preview: ["#0F080C", "#3B1020", "#C9748A"],
    bg: {
      // Deep reddish-dark gradients for a moody rose night atmosphere
      background: `
        radial-gradient(ellipse 75% 65% at 5% 10%, #3B1020 0%, transparent 55%),
        radial-gradient(ellipse 60% 55% at 90% 85%, #2A1018 0%, transparent 55%),
        radial-gradient(ellipse 35% 30% at 68% 28%, rgba(201,116,138,0.20) 0%, transparent 50%),
        #0F080C`,
    },
    gl: {
      // Very translucent glass surfaces for dark mode (low alpha)
      card: "rgba(255,255,255,0.06)", row: "rgba(255,255,255,0.05)", sidebar: "rgba(255,255,255,0.04)",
      // Menus and dropdowns are NOT glass: they float over the very rows they
      // filter, and a translucent panel let that text read straight through it
      // (backdrop-filter does not compose when the sticky bar above already
      // blurs). One opaque surface per theme — lifted off the near-black base.
      popover: "#1F141A",
      blur20: "blur(20px)", blur24: "blur(24px)", blur16: "blur(16px)",
      // Subtle white borders — just enough to define glass edges in dark
      border: "1px solid rgba(255,255,255,0.10)", borderSm: "1px solid rgba(255,255,255,0.08)",
      // Stronger black shadows for depth in dark mode
      shadow: "0 4px 24px rgba(0,0,0,0.30)", shadowSm: "0 2px 12px rgba(0,0,0,0.25)",
      // Light cream text on dark backgrounds; muted at 70% clears 4.5:1 on
      // the glass cards (WCAG 1.4.3)
      text: "#F5ECED", muted: "rgba(255,220,225,0.70)",
      accent: "#C9748A", accentGrad: "#C9748A", accentRgb: "201,116,138",
      // Lighter pink tones for success/warning in dark context for better readability
      success: "#F0A0B0", warning: "#E8907A", danger: "#F87171", info: "#60A5FA",
      headerBg: "rgba(15,8,12,0.70)", inputBg: "rgba(255,255,255,0.06)",
      sidebarBorder: "1px solid rgba(255,255,255,0.08)",
      isDark: true,
    },
  },

  // ─── Light Green ─────────────────────────────────────────────────────────────
  // DEFAULT THEME — deep corporate green (#166534) for CTA/brand, yellow/red/
  // blue reserved for semantic highlights. Glass treatment mirrors light-rose
  // (translucent stacking surfaces + blur), which also keeps case rows visibly
  // distinct from the panel they sit on. Supersedes the earlier flat/no-gradient
  // styling (27/07/2026).
  "light-green": {
    label: "Light Green",
    preview: ["#F4F8F5", "#DCE8E0", "#166534"],
    bg: {
      // Multi-layer radial gradients for a soft green halo effect on a light base
      background: `
        radial-gradient(ellipse 65% 55% at 85% 10%, rgba(167,209,183,0.45) 0%, transparent 55%),
        radial-gradient(ellipse 55% 50% at 12% 80%, rgba(22,101,52,0.12) 0%, transparent 55%),
        radial-gradient(ellipse 70% 60% at 50% 50%, rgba(240,248,242,0.80) 0%, transparent 65%),
        #F4F8F5`,
    },
    gl: {
      // Glass surfaces — alphas stack, so rows read a step above their parent card
      card: "rgba(255,255,255,0.65)", row: "rgba(255,255,255,0.55)", sidebar: "rgba(255,255,255,0.50)",
      // Menus and dropdowns are NOT glass: they float over the very rows they
      // filter, and a translucent panel let that text read straight through it
      // (backdrop-filter does not compose when the sticky bar above already
      // blurs). One opaque surface per theme — the faintest green-white.
      popover: "#FAFDFB",
      blur20: "blur(20px)", blur24: "blur(24px)", blur16: "blur(16px)",
      // White glass borders — stronger on outer surfaces, subtler inside
      border: "1px solid rgba(255,255,255,0.90)", borderSm: "1px solid rgba(255,255,255,0.80)",
      // Green-tinted soft shadows
      shadow: "0 4px 20px rgba(22,101,52,0.08)", shadowSm: "0 2px 8px rgba(22,101,52,0.06)",
      // muted = black (hospital request 22/07/2026): secondary text — VN, dates,
      // labels, hints — reads at full contrast; hierarchy comes from size/weight
      text: "#12211A", muted: "#000000",
      accent: "#166534", accentGrad: "#166534", accentRgb: "22,101,52",
      // Semantic palette: green CTA/success, yellow warning, red danger, blue info
      success: "#166534", warning: "#D97706", danger: "#DC2626", info: "#2563EB",
      headerBg: "rgba(244,248,245,0.80)", inputBg: "rgba(255,255,255,0.60)",
      sidebarBorder: "1px solid rgba(22,101,52,0.12)",
      isDark: false,
    },
  },

  // ─── Mono ────────────────────────────────────────────────────────────────────
  // A neutral, grayscale light theme.
  "mono": {
    label: "Mono",
    preview: ["#F8F8F8", "#E0E0E0", "#1A1A1A"],
    bg: {
      // Subtle gray gradients — minimal visual noise, maximum readability
      background: `
        radial-gradient(ellipse 65% 55% at 85% 10%, rgba(200,200,200,0.30) 0%, transparent 55%),
        radial-gradient(ellipse 55% 50% at 12% 80%, rgba(120,120,120,0.10) 0%, transparent 55%),
        radial-gradient(ellipse 70% 60% at 50% 50%, rgba(245,245,245,0.85) 0%, transparent 65%),
        #F4F4F4`,
    },
    gl: {
      card: "rgba(255,255,255,0.72)", row: "rgba(255,255,255,0.60)", sidebar: "rgba(255,255,255,0.55)",
      // Menus and dropdowns are NOT glass: they float over the very rows they
      // filter, and a translucent panel let that text read straight through it
      // (backdrop-filter does not compose when the sticky bar above already
      // blurs). One opaque surface per theme — plain white.
      popover: "#FFFFFF",
      blur20: "blur(20px)", blur24: "blur(24px)", blur16: "blur(16px)",
      // Pure black borders for clear edge definition in a colorless theme
      border: "1px solid rgba(0,0,0,0.10)", borderSm: "1px solid rgba(0,0,0,0.08)",
      shadow: "0 4px 20px rgba(0,0,0,0.08)", shadowSm: "0 2px 8px rgba(0,0,0,0.06)",
      // muted at 60% black passes 4.5:1 on the near-white base (old 0.42 ≈ 3:1)
      text: "#111111", muted: "rgba(0,0,0,0.60)",
      // Near-black accent for a high-contrast, accessible mono palette
      accent: "#1A1A1A", accentGrad: "#1A1A1A", accentRgb: "26,26,26",
      success: "#2D2D2D", warning: "#555555", danger: "#DC2626", info: "#2563EB",
      headerBg: "rgba(244,244,244,0.85)", inputBg: "rgba(255,255,255,0.65)",
      sidebarBorder: "1px solid rgba(0,0,0,0.09)",
      isDark: false,
    },
  },
};

export { themes };

// ─── Context Types ────────────────────────────────────────────────────────────

/**
 * ThemeContextValue — the shape of the value provided by ThemeCtx.
 *   - themeId   : the currently active theme key
 *   - setThemeId: function to switch to a different theme
 *   - gl        : shortcut to the active theme's glassmorphism tokens
 */
type ThemeContextValue = {
  themeId: ThemeId;
  setThemeId: (t: ThemeId) => void;
  gl: GL;
};

// ─── Context & Hook ───────────────────────────────────────────────────────────

/**
 * ThemeCtx — React Context for the active theme.
 * Default value falls back to "mono" so the app renders safely before a provider mounts.
 */
export const ThemeCtx = createContext<ThemeContextValue>({
  themeId: "light-green",
  setThemeId: () => {},
  gl: themes["light-green"].gl,
});

/** useTheme — consume the current theme context anywhere inside <ThemeProvider>. */
export const useTheme = () => useContext(ThemeCtx);

/**
 * useThemeProvider — stateful hook used by <ThemeProvider> to own the theme state.
 * Returns themeId, setThemeId, gl (tokens), and the full theme config object.
 */
export const useThemeProvider = () => {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    const saved = localStorage.getItem("theme");
    return saved && saved in themes ? (saved as ThemeId) : "light-green";
  });
  const setThemeId = (id: ThemeId) => {
    localStorage.setItem("theme", id);
    setThemeIdState(id);
  };
  const gl = themes[themeId].gl;
  const theme = themes[themeId];
  return { themeId, setThemeId, gl, theme };
};
