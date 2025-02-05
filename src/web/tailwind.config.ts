import type { Config } from "tailwindcss"; // ^3.0.0

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/pages/**/*.{ts,tsx}",
  ],
  safelist: [
    "dark",
    "light",
    "data-theme",
    "transaction-positive",
    "transaction-negative",
    "balance-warning",
    "balance-critical",
  ],
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "2rem",
        lg: "4rem",
      },
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
    },
    extend: {
      colors: {
        background: "rgb(var(--background))",
        foreground: "rgb(var(--foreground))",
        primary: {
          DEFAULT: "rgb(var(--primary))",
          foreground: "rgb(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary))",
          foreground: "rgb(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "rgb(var(--muted))",
          foreground: "rgb(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "rgb(var(--accent))",
          foreground: "rgb(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "rgb(var(--success))",
          light: "rgb(var(--success-light))",
          dark: "rgb(var(--success-dark))",
        },
        error: {
          DEFAULT: "rgb(var(--error))",
          light: "rgb(var(--error-light))",
          dark: "rgb(var(--error-dark))",
        },
        warning: {
          DEFAULT: "rgb(var(--warning))",
          light: "rgb(var(--warning-light))",
          dark: "rgb(var(--warning-dark))",
        },
        financial: {
          positive: "rgb(var(--financial-positive))",
          negative: "rgb(var(--financial-negative))",
          pending: "rgb(var(--financial-pending))",
          neutral: "rgb(var(--financial-neutral))",
        },
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        card: "var(--radius-card)",
        button: "var(--radius-button)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        balance: ["2.5rem", { lineHeight: "3rem", fontWeight: "700" }],
        amount: ["2rem", { lineHeight: "2.5rem", fontWeight: "600" }],
        currency: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "500" }],
      },
    },
  },
  plugins: [
    "tailwindcss/nesting",
    "@tailwindcss/forms",
    "@tailwindcss/typography",
    "@tailwindcss/aspect-ratio",
  ],
} as const;

export default config;