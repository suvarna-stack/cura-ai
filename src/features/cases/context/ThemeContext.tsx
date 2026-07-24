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
    preview: ["#FDF5F7", "#fce4ec", "#C9748A"],
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
      // Backdrop blur levels for glass layers
      blur20: "blur(20px)", blur24: "blur(24px)", blur16: "blur(16px)",
      // Border tokens — stronger on outer glass, subtler on inner elements
      border: "1px solid rgba(255,255,255,0.90)", borderSm: "1px solid rgba(255,255,255,0.80)",
      // Drop shadows with rose-tinted color
      shadow: "0 4px 20px rgba(180,80,100,0.08)", shadowSm: "0 2px 8px rgba(180,80,100,0.06)",
      // Typography — dark base text, 50% opacity muted color
      text: "#1A0810", muted: "rgba(80,20,40,0.50)",
      // Accent color (rose-gold) used for highlights, active states, icons
      accent: "#C9748A", accentGrad: "#C9748A", accentRgb: "201,116,138",
      // Semantic colors
      success: "#C9748A", warning: "#D97706", danger: "#DC2626", info: "#2563EB",
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
      blur20: "blur(20px)", blur24: "blur(24px)", blur16: "blur(16px)",
      // Subtle white borders — just enough to define glass edges in dark
      border: "1px solid rgba(255,255,255,0.10)", borderSm: "1px solid rgba(255,255,255,0.08)",
      // Stronger black shadows for depth in dark mode
      shadow: "0 4px 24px rgba(0,0,0,0.30)", shadowSm: "0 2px 12px rgba(0,0,0,0.25)",
      // Light cream text on dark backgrounds
      text: "#F5ECED", muted: "rgba(255,220,225,0.50)",
      accent: "#C9748A", accentGrad: "#C9748A", accentRgb: "201,116,138",
      // Lighter pink tones for success/warning in dark context for better readability
      success: "#F0A0B0", warning: "#E8907A", danger: "#F87171", info: "#60A5FA",
      headerBg: "rgba(15,8,12,0.70)", inputBg: "rgba(255,255,255,0.06)",
      sidebarBorder: "1px solid rgba(255,255,255,0.08)",
      isDark: true,
    },
  },

  // ─── Light Green ─────────────────────────────────────────────────────────────
  // DEFAULT THEME — hospital-approved palette. Mature, professional look:
  // flat background (no gradients), deep corporate green (#166534) for
  // CTA/brand, yellow/red/blue reserved for semantic highlights.
  "light-green": {
    label: "Light Green",
    preview: ["#F5F7F6", "#DCE8E0", "#166534"],
    bg: {
      // Flat neutral base with a faint green tint — deliberately plain
      background: "#F5F7F6",
    },
    gl: {
      // Solid surfaces — no glass translucency on the main theme
      card: "#FFFFFF", row: "#FFFFFF", sidebar: "#FAFBFA",
      // Blur disabled: flat surfaces don't need backdrop filters
      blur20: "none", blur24: "none", blur16: "none",
      // Neutral gray hairline borders for clear, quiet structure
      border: "1px solid rgba(0,0,0,0.08)", borderSm: "1px solid rgba(0,0,0,0.06)",
      // Restrained shadows — depth without decoration
      shadow: "0 1px 3px rgba(0,0,0,0.06)", shadowSm: "0 1px 2px rgba(0,0,0,0.04)",
      // muted = black (hospital request 22/07/2026): secondary text — VN, dates,
      // labels, hints — reads at full contrast; hierarchy comes from size/weight
      text: "#12211A", muted: "#000000",
      accent: "#166534", accentGrad: "#166534", accentRgb: "22,101,52",
      // Semantic palette: green CTA/success, yellow warning, red danger, blue info
      success: "#166534", warning: "#D97706", danger: "#DC2626", info: "#2563EB",
      headerBg: "rgba(245,247,246,0.95)", inputBg: "#FFFFFF",
      sidebarBorder: "1px solid rgba(0,0,0,0.07)",
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
      blur20: "blur(20px)", blur24: "blur(24px)", blur16: "blur(16px)",
      // Pure black borders for clear edge definition in a colorless theme
      border: "1px solid rgba(0,0,0,0.10)", borderSm: "1px solid rgba(0,0,0,0.08)",
      shadow: "0 4px 20px rgba(0,0,0,0.08)", shadowSm: "0 2px 8px rgba(0,0,0,0.06)",
      text: "#111111", muted: "rgba(0,0,0,0.42)",
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
