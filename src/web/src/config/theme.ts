import type { Config } from 'tailwindcss'; // ^3.0.0

/**
 * Theme configuration type defining the structure of our design system
 */
type ThemeConfig = {
  colors: Record<string, Record<'light' | 'dark' | 'DEFAULT', string>>;
  typography: Record<string, Record<string, string | string[]>>;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  colorContrast: Record<string, Record<'light' | 'dark', number>>;
  animation: Record<string, string>;
  breakpoints: Record<string, string>;
};

/**
 * Core color palette with CSS variable support and WCAG 2.1 AA compliant contrast ratios
 * Each color has light/dark variants and a default value
 */
export const colors = {
  primary: {
    light: 'var(--color-primary-light, #0066FF)',
    dark: 'var(--color-primary-dark, #3385FF)',
    DEFAULT: 'var(--color-primary, #0066FF)',
  },
  secondary: {
    light: 'var(--color-secondary-light, #6B7280)',
    dark: 'var(--color-secondary-dark, #9CA3AF)', 
    DEFAULT: 'var(--color-secondary, #6B7280)',
  },
  success: {
    light: 'var(--color-success-light, #10B981)',
    dark: 'var(--color-success-dark, #34D399)',
    DEFAULT: 'var(--color-success, #10B981)',
  },
  error: {
    light: 'var(--color-error-light, #EF4444)',
    dark: 'var(--color-error-dark, #F87171)',
    DEFAULT: 'var(--color-error, #EF4444)',
  },
  warning: {
    light: 'var(--color-warning-light, #F59E0B)',
    dark: 'var(--color-warning-dark, #FBBF24)',
    DEFAULT: 'var(--color-warning, #F59E0B)',
  },
  background: {
    light: 'var(--color-background-light, #FFFFFF)',
    dark: 'var(--color-background-dark, #1F2937)',
    DEFAULT: 'var(--color-background, #FFFFFF)',
  },
  text: {
    light: 'var(--color-text-light, #111827)',
    dark: 'var(--color-text-dark, #F9FAFB)',
    DEFAULT: 'var(--color-text, #111827)',
  },
};

/**
 * WCAG 2.1 AA compliance color contrast ratios
 * Minimum 4.5:1 for normal text and 3:1 for large text
 */
export const colorContrast = {
  primary: {
    light: 4.5,
    dark: 4.5,
  },
  secondary: {
    light: 4.5,
    dark: 4.5,
  },
};

/**
 * Typography system using fluid type scaling and system fonts
 */
export const typography = {
  fontFamily: {
    sans: ['Inter var', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'monospace'],
  },
  fontSize: {
    xs: 'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)',
    sm: 'clamp(0.875rem, 0.825rem + 0.25vw, 1rem)',
    base: 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)',
    lg: 'clamp(1.125rem, 1.075rem + 0.25vw, 1.25rem)',
    xl: 'clamp(1.25rem, 1.2rem + 0.25vw, 1.5rem)',
    '2xl': 'clamp(1.5rem, 1.45rem + 0.25vw, 1.875rem)',
  },
};

/**
 * Spacing scale using 4px (0.25rem) increments
 */
const spacing = {
  px: '1px',
  0: '0',
  0.5: '0.125rem',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  32: '8rem',
  40: '10rem',
  48: '12rem',
  56: '14rem',
  64: '16rem',
};

/**
 * Border radius scale
 */
const borderRadius = {
  none: '0',
  sm: '0.125rem',
  DEFAULT: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  full: '9999px',
};

/**
 * Box shadow definitions
 */
const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
};

/**
 * Animation definitions
 */
export const animation = {
  none: 'none',
  spin: 'spin 1s linear infinite',
  ping: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
  pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  bounce: 'bounce 1s infinite',
};

/**
 * Breakpoint definitions following Tailwind's default scale
 */
const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

/**
 * Complete theme configuration object
 */
export const theme: ThemeConfig = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  colorContrast,
  animation,
  breakpoints,
};

export default theme;