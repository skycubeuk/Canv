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
        app: 'var(--bg-app)',
        panel: 'var(--bg-panel)',
        elev: 'var(--bg-elev)',
        hover: 'var(--bg-hover)',
        active: 'var(--bg-active)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-fg': 'var(--accent-fg)',
        'accent-hover': 'var(--accent-hover)',
      },
      textColor: {
        default: 'var(--text-default)',
        muted: 'var(--text-muted)',
        subtle: 'var(--text-subtle)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        'accent-hover': 'var(--accent-hover)',
      },
      borderColor: {
        default: 'var(--border-default)',
        strong: 'var(--border-strong)',
        accent: 'var(--accent)',
      },
      ringColor: {
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
      },
      ringOffsetColor: {
        app: 'var(--bg-app)',
        panel: 'var(--bg-panel)',
        elev: 'var(--bg-elev)',
      },
      boxShadow: {
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [typography],
}
