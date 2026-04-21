/**
 * Design Tokens for NexaPay Portal
 * Centralized design system for consistent styling across the application
 */

// Colors
export const colors = {
  // Background colors
  bg: {
    0: "#070911",
    1: "#0b0f1e",
    2: "#0e1324",
    3: "#121a2f",
  },

  // Surface colors
  surface: {
    0: "#0e1324",
    1: "#121a2f",
    gradient: "linear-gradient(150deg, #0d1224 5%, #090d1b 58%, #070a15 100%)",
  },

  // Text colors
  text: {
    0: "#f5f7ff",
    1: "#b8bfd8",
    2: "rgba(255, 255, 255, 0.84)",
    3: "rgba(255, 255, 255, 0.62)",
    4: "rgba(255, 255, 255, 0.42)",
    muted: "rgba(255, 255, 255, 0.56)",
    disabled: "rgba(255, 255, 255, 0.38)",
  },

  // Brand colors
  brand: {
    primary: "#2de6c4",
    primaryDark: "#1dc4a5",
    secondary: "#ff8f5a",
    secondaryLight: "#ffb187",
    tertiary: "#57c8ff",
    accent: "#a1ffe2",
    orange: "#ffb17f",
    teal: "#7cf4bd",
    pink: "#ff9cbc",
    purple: "#7f85ff",
    yellow: "#ffb17f",
    blue: "#57c8ff",
  },

  // Border colors
  border: {
    light: "rgba(255, 255, 255, 0.15)",
    medium: "rgba(255, 255, 255, 0.11)",
    dark: "rgba(255, 255, 255, 0.08)",
    brand: "rgba(255, 143, 90, 0.5)",
    success: "rgba(124, 244, 189, 0.25)",
    error: "rgba(255, 156, 188, 0.25)",
  },

  // Status colors
  status: {
    success: {
      text: "#7cf4bd",
      bg: "rgba(124, 244, 189, 0.1)",
      border: "rgba(124, 244, 189, 0.25)",
    },
    warning: {
      text: "#ffb17f",
      bg: "rgba(255, 177, 127, 0.1)",
      border: "rgba(255, 177, 127, 0.25)",
    },
    error: {
      text: "#ffc3d6",
      bg: "rgba(255, 156, 188, 0.1)",
      border: "rgba(255, 156, 188, 0.25)",
    },
    info: {
      text: "#57c8ff",
      bg: "rgba(87, 200, 255, 0.1)",
      border: "rgba(87, 200, 255, 0.25)",
    },
  },
};

// Typography
export const typography = {
  fontFamily: {
    sans: "var(--font-sora), sans-serif",
    mono: "monospace",
  },

  fontSize: {
    xs: "0.75rem", // 12px
    sm: "0.875rem", // 14px
    base: "1rem", // 16px
    lg: "1.125rem", // 18px
    xl: "1.25rem", // 20px
    "2xl": "1.5rem", // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem", // 36px
    "5xl": "3rem", // 48px
    "6xl": "3.75rem", // 60px
    "7xl": "4.5rem", // 72px
    "8xl": "6rem", // 96px
  },

  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },

  letterSpacing: {
    tight: "-0.025em",
    normal: "0",
    wide: "0.025em",
    wider: "0.05em",
    widest: "0.1em",
    uppercase: "0.1em",
  },

  lineHeight: {
    none: "1",
    tight: "1.25",
    snug: "1.375",
    normal: "1.5",
    relaxed: "1.625",
    loose: "2",
  },
};

// Spacing (in pixels, converted to rem)
export const spacing = {
  0: "0",
  1: "0.25rem", // 4px
  2: "0.5rem", // 8px
  3: "0.75rem", // 12px
  4: "1rem", // 16px
  5: "1.25rem", // 20px
  6: "1.5rem", // 24px
  8: "2rem", // 32px
  10: "2.5rem", // 40px
  12: "3rem", // 48px
  16: "4rem", // 64px
  20: "5rem", // 80px
  24: "6rem", // 96px
  32: "8rem", // 128px
  40: "10rem", // 160px
  48: "12rem", // 192px
  56: "14rem", // 224px
  64: "16rem", // 256px
};

// Border Radius
export const borderRadius = {
  none: "0",
  sm: "0.25rem", // 4px
  base: "0.5rem", // 8px
  md: "0.75rem", // 12px
  lg: "1rem", // 16px
  xl: "1.25rem", // 20px
  "2xl": "1.5rem", // 24px
  "3xl": "1.875rem", // 30px
  "4xl": "2.25rem", // 36px
  full: "9999px",
};

// Shadows
export const shadows = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  base: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
  inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
  none: "none",

  // Custom shadows
  hero: "0 30px 80px rgba(0, 0, 0, 0.52)",
  card: "0 26px 50px rgba(0, 0, 0, 0.45)",
  glow: "0 8px 22px rgba(255, 143, 90, 0.3)",
  glowHover: "0 14px 30px rgba(255, 143, 90, 0.4)",
};

// Gradients
export const gradients = {
  // Background gradients
  bg: {
    primary: "linear-gradient(180deg, var(--bg-1) 0%, var(--bg-0) 100%)",
    hero: "linear-gradient(150deg, #0d1224 5%, #090d1b 58%, #070a15 100%)",
    surface: "linear-gradient(160deg, #0f1322, #0a0e1b)",
    card: "linear-gradient(150deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))",
  },

  // Brand gradients
  brand: {
    primary: "linear-gradient(130deg, #ff8f5a, #ffb187)",
    secondary: "linear-gradient(120deg, var(--brand), #7dffbe)",
    accent: "linear-gradient(120deg, #ff8d4d, #ffb17f)",
    teal: "linear-gradient(120deg, var(--brand), #7dffbe)",
    orange: "linear-gradient(120deg, #ff8d4d, #ffb17f)",
  },

  // Button gradients
  button: {
    primary: "linear-gradient(130deg, #ff8f5a, #ffb187)",
    secondary: "linear-gradient(120deg, var(--brand), #7dffbe)",
    accent: "linear-gradient(120deg, #ff8d4d, #ffb17f)",
  },
};

// Animations
export const animations = {
  durations: {
    fast: "150ms",
    normal: "300ms",
    slow: "500ms",
    verySlow: "1000ms",
  },

  easings: {
    linear: "linear",
    ease: "ease",
    easeIn: "ease-in",
    easeOut: "ease-out",
    easeInOut: "ease-in-out",
    spring: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
  },

  keyframes: {
    rise: {
      from: {
        opacity: "0",
        transform: "translateY(12px)",
      },
      to: {
        opacity: "1",
        transform: "translateY(0)",
      },
    },
    spin: {
      from: {
        transform: "rotate(0deg)",
      },
      to: {
        transform: "rotate(360deg)",
      },
    },
    pulse: {
      "0%, 100%": {
        opacity: "1",
      },
      "50%": {
        opacity: "0.5",
      },
    },
  },
};

// Z-index scale
export const zIndex = {
  hide: -1,
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  toast: 1700,
  tooltip: 1800,
};

// Breakpoints (matches Tailwind defaults)
export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
};

// Utility functions
export const utils = {
  /**
   * Convert pixel value to rem
   */
  pxToRem: (px: number): string => `${px / 16}rem`,

  /**
   * Create a responsive value based on breakpoints
   */
  responsive: <T>(values: Partial<Record<keyof typeof breakpoints, T>>, defaultValue: T): T => {
    return defaultValue;
  },

  /**
   * Get color with opacity
   */
  withOpacity: (color: string, opacity: number): string => {
    // Simple implementation - in real use, you might want to convert hex to rgba
    return color;
  },
};

// CSS custom properties for easy theming
export const cssVariables = {
  colors: {
    "--bg-0": colors.bg[0],
    "--bg-1": colors.bg[1],
    "--surface-0": colors.surface[0],
    "--surface-1": colors.surface[1],
    "--text-0": colors.text[0],
    "--text-1": colors.text[1],
    "--line": colors.border.medium,
    "--brand": colors.brand.primary,
    "--brand-2": colors.brand.tertiary,
    "--brand-3": colors.brand.accent,
  },
};

// Component-specific styles
export const components = {
  // Button styles
  button: {
    base: "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants: {
      default: "border border-[var(--brand)]/30 bg-[linear-gradient(120deg,var(--brand),#7dffbe)] text-[#041008] hover:brightness-110",
      outline: "border border-white/14 bg-white/5 text-white hover:bg-white/10",
      ghost: "border border-white/20 bg-transparent text-white hover:bg-white/10",
      accent: "border border-[#ff8d4d]/40 bg-[linear-gradient(120deg,#ff8d4d,#ffb17f)] text-[#2b0f00] hover:brightness-110",
    },
    sizes: {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-lg px-3",
      lg: "h-11 rounded-xl px-8",
    },
  },

  // Card styles
  card: {
    base: "rounded-2xl border border-white/10 bg-[linear-gradient(150deg,#121716,#0b0f0e)] text-white shadow-[0_14px_45px_rgba(0,0,0,0.45)]",
  },

  // Input styles
  input: {
    base: "mt-2 h-11 w-full rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white placeholder:text-white/38 outline-none transition focus:border-[#ff8f5a]",
  },

  // Hero section styles
  hero: {
    base: "pro-hero animate-rise",
    noise: "hero-noise",
    tag: "hero-tag",
    title: "hero-title",
    subtitle: "hero-subtitle",
  },

  // Story/Platform section styles
  story: {
    base: "platform-story",
    head: "story-head",
    kicker: "story-kicker",
    title: "story-title",
    copy: "story-copy",
    grid: "story-grid",
    card: "story-card",
    cardTag: "story-card-tag",
    cardUser: "story-card-user",
    miniList: "story-mini-list",
    tx: "story-tx",
    pillRow: "story-pill-row",
  },
};

// Export everything
export default {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  gradients,
  animations,
  zIndex,
  breakpoints,
  utils,
  cssVariables,
  components,
};
