import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Source Serif 4"', '"Source Serif Pro"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        app: 'rgb(var(--bg-app) / <alpha-value>)',
        panel: 'rgb(var(--bg-panel) / <alpha-value>)',
        elev: 'rgb(var(--bg-elev) / <alpha-value>)',
        hover: 'rgb(var(--bg-hover) / <alpha-value>)',
        active: 'rgb(var(--bg-active) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-soft': 'var(--accent-soft)',
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
        'accent-hover': 'var(--accent-hover)',
      },
      textColor: {
        default: 'rgb(var(--text-default) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        subtle: 'rgb(var(--text-subtle) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
        'accent-hover': 'var(--accent-hover)',
      },
      borderColor: {
        default: 'rgb(var(--border-default) / <alpha-value>)',
        strong: 'rgb(var(--border-strong) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
      },
      ringColor: {
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-soft': 'var(--accent-soft)',
      },
      ringOffsetColor: {
        app: 'rgb(var(--bg-app) / <alpha-value>)',
        panel: 'rgb(var(--bg-panel) / <alpha-value>)',
        elev: 'rgb(var(--bg-elev) / <alpha-value>)',
      },
      boxShadow: {
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [typography],
}
