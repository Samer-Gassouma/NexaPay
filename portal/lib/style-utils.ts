/**
 * Style Utilities for NexaPay Portal
 * Utility classes for consistent design system implementation
 */

import { cssVariables, components } from './design-tokens';

/**
 * Utility classes for common design patterns
 */
export const styleUtils = {
  // Layout utilities
  layout: {
    container: 'mx-auto max-w-[1260px] px-4',
    section: 'mx-auto max-w-[1260px] px-4 py-8 md:py-10',
    grid: {
      responsive: 'grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_360px]',
      hero: 'grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_340px]',
      story: 'grid gap-6',
    },
  },

  // Typography utilities
  typography: {
    heroTitle: 'font-[var(--font-sora)] text-[clamp(2.25rem,5vw,4.5rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-white',
    storyTitle: 'font-[var(--font-sora)] text-[clamp(1.9rem,3.3vw,3.2rem)] leading-[1.06] text-white',
    sectionTitle: 'text-lg font-semibold text-white',
    body: 'text-base leading-7 text-white/66',
    bodySmall: 'text-sm leading-6 text-white/60',
    label: 'text-sm font-medium text-white/80',
    labelLight: 'text-sm font-medium text-white/62',
    caption: 'text-xs text-white/42',
    uppercase: 'text-[11px] uppercase tracking-[0.2em]',
    mono: 'font-mono text-xs',
  },

  // Color utilities
  colors: {
    text: {
      primary: 'text-white',
      secondary: 'text-white/66',
      tertiary: 'text-white/42',
      muted: 'text-white/56',
      brand: 'text-[#ffb17f]',
      success: 'text-[#7cf4bd]',
      error: 'text-[#ffc3d6]',
      warning: 'text-[#ffb17f]',
      info: 'text-[#57c8ff]',
    },
    bg: {
      surface: 'bg-[#0d1328]',
      card: 'bg-[#0b1122]/90',
      dark: 'bg-[linear-gradient(160deg,#11162a,#0b0f1d)]',
      gradient: 'bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]',
      success: 'bg-[#7cf4bd]/10',
      error: 'bg-[#2a1520]/70',
      warning: 'bg-[#ffb17f]/10',
      info: 'bg-[#57c8ff]/10',
    },
  },

  // Border utilities
  borders: {
    default: 'border border-white/10',
    light: 'border border-white/15',
    medium: 'border border-white/12',
    brand: 'border border-[#ff8f5a]/40',
    success: 'border border-[#7cf4bd]/25',
    error: 'border border-[#ff9cbc]/20',
    warning: 'border border-[#ffb17f]/25',
    dashed: 'border border-dashed border-white/12',
  },

  // Shadow utilities
  shadows: {
    hero: 'shadow-[0_30px_80px_rgba(0,0,0,0.52)]',
    card: 'shadow-[0_20px_60px_rgba(0,0,0,0.28)]',
    button: 'shadow-[0_8px_22px_rgba(255,143,90,0.3)]',
    inner: 'shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]',
  },

  // Radius utilities
  radius: {
    sm: 'rounded-[12px]',
    md: 'rounded-[18px]',
    lg: 'rounded-[20px]',
    xl: 'rounded-[24px]',
    '2xl': 'rounded-[28px]',
    full: 'rounded-full',
  },

  // Interactive utilities
  interactive: {
    hover: {
      lift: 'transition-transform hover:translate-y-[-1px]',
      brightness: 'hover:brightness-110',
      border: 'hover:border-white/25',
    },
    focus: {
      ring: 'focus:outline-none focus:ring-2 focus:ring-[var(--brand)]',
      border: 'focus:border-[#ff8f5a]',
    },
    disabled: 'disabled:opacity-50 disabled:cursor-not-allowed',
  },

  // Spacing utilities
  spacing: {
    p: {
      4: 'p-4',
      5: 'p-5',
      6: 'p-6',
    },
    py: {
      3: 'py-3',
      4: 'py-4',
      5: 'py-5',
    },
    px: {
      4: 'px-4',
      5: 'px-5',
      6: 'px-6',
    },
    gap: {
      3: 'gap-3',
      4: 'gap-4',
      5: 'gap-5',
      6: 'gap-6',
    },
    mt: {
      3: 'mt-3',
      4: 'mt-4',
      5: 'mt-5',
      6: 'mt-6',
    },
    mb: {
      3: 'mt-3',
      4: 'mt-4',
      5: 'mt-5',
    },
  },

  // Animation utilities
  animations: {
    rise: 'animate-rise',
    spin: 'animate-spin',
    fadeIn: 'animate-fadeIn',
  },

  // Component-specific utilities
  components: {
    // Button-like elements
    btn: {
      base: 'neo-btn',
      primary: 'neo-btn neo-btn--primary',
      ghost: 'neo-btn neo-btn--ghost',
      dark: 'neo-btn neo-btn--dark',
    },

    // Form elements
    form: {
      input: components.input.base,
      field: 'block text-sm font-medium text-white/80',
      label: 'text-sm font-medium text-white/80',
    },

    // Card components
    card: {
      base: components.card.base,
      metric: 'rounded-[18px] border border-white/10 bg-white/[0.04] p-4',
      detail: 'rounded-[20px] border border-white/10 bg-[#0b1122]/90 p-4',
      info: 'rounded-[24px] border border-white/10 bg-[linear-gradient(160deg,#11162a,#0b0f1d)] p-6',
    },

    // Hero components
    hero: {
      base: components.hero.base,
      noise: components.hero.noise,
      tag: components.hero.tag,
      title: components.hero.title,
      subtitle: components.hero.subtitle,
    },

    // Story components
    story: {
      base: components.story.base,
      head: components.story.head,
      kicker: components.story.kicker,
      title: components.story.title,
      copy: components.story.copy,
      grid: components.story.grid,
      card: components.story.card,
      cardTag: components.story.cardTag,
      miniList: components.story.miniList,
      tx: components.story.tx,
      pillRow: components.story.pillRow,
    },
  },
};

/**
 * Helper function to combine multiple utility classes
 */
export function clsx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Create a responsive grid utility
 */
export function responsiveGrid(breakpoint: 'sm' | 'md' | 'lg' | 'xl' = 'xl'): string {
  const grids = {
    sm: 'grid gap-4 sm:grid-cols-2',
    md: 'grid gap-4 md:grid-cols-2',
    lg: 'grid gap-6 lg:grid-cols-2',
    xl: 'grid gap-6 xl:grid-cols-2',
  };
  return grids[breakpoint];
}

/**
 * Create a metric card utility
 */
export function metricCard(className?: string): string {
  return clsx(
    'rounded-[18px] border border-white/10 bg-white/[0.04] p-4',
    className
  );
}

/**
 * Create a status badge utility
 */
export function statusBadge(status: 'success' | 'warning' | 'error' | 'info' | 'default'): string {
  const statusClasses = {
    success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
    warning: 'border-[#ffb17f]/25 bg-[#ffb17f]/10 text-[#ffb17f]',
    error: 'border-[#ff9cbc]/25 bg-[#ff9cbc]/10 text-[#ffd5e2]',
    info: 'border-[#57c8ff]/25 bg-[#57c8ff]/10 text-[#57c8ff]',
    default: 'border-white/14 bg-white/5 text-white',
  };
  return clsx(
    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium',
    statusClasses[status]
  );
}

/**
 * Create a form input utility
 */
export function formInput(className?: string): string {
  return clsx(
    'mt-2 h-11 w-full rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white placeholder:text-white/38 outline-none transition focus:border-[#ff8f5a]',
    className
  );
}

/**
 * Create a section header utility
 */
export function sectionHeader(className?: string): string {
  return clsx(
    'flex items-center justify-between gap-3',
    className
  );
}

// Export default
export default styleUtils;
