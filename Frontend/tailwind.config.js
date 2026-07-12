/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/rider/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: "var(--color-bg-app)",
        surface: "var(--color-bg-surface)",
        "surface-2": "var(--color-bg-surface-2)",
        elevated: "var(--color-bg-elevated)",
        muted: "var(--color-bg-muted)",
        main: "var(--color-text-primary)",
        subtle: "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        disabled: "var(--color-text-disabled)",
        soft: "var(--color-border-soft)",
        strong: "var(--color-border-strong)",
        brand: "var(--color-brand-primary)",
        "brand-hover": "var(--color-brand-primary-hover)",
        "brand-soft": "var(--color-brand-soft)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
      },
      boxShadow: {
        card: "var(--color-shadow-card)",
        elevated: "var(--color-shadow-elevated)",
        glow: "var(--color-shadow-brand-glow)",
      },
    },
  },
  plugins: [],
};
