import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    css: false,
    // On GitHub Actions, also emit workflow annotations so failing assertions
    // surface inline on the commit/PR instead of only in the log.
    reporters: process.env.GITHUB_ACTIONS ? ['default', 'github-actions'] : ['default'],
    coverage: {
      provider: 'v8',
      // json-summary feeds scripts/ci-summary.mjs (the CI job summary).
      reporter: ['text-summary', 'html', 'json-summary'],
      // Erosion floor, set just under the measured baseline (2026-06:
      // 80.9% lines / 77.7% statements / 75.2% functions / 65.3% branches).
      // Raise as coverage grows; never lower to make a PR pass.
      thresholds: {
        lines: 78,
        statements: 75,
        functions: 72,
        branches: 62,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          // Bench files live in src/ but use a node-friendly subset (no DOM
          // mount). Scope to one project so `npm run test:bench` doesn't
          // fire 3× — once per project.
          benchmark: {
            include: ['src/**/*.bench.ts'],
          },
        },
      },
      {
        test: {
          name: 'electron',
          environment: 'node',
          globals: true,
          include: ['electron/**/*.test.cjs'],
          // Explicitly no benches in this project.
          benchmark: {
            include: [],
          },
        },
      },
      {
        test: {
          name: 'scripts',
          environment: 'node',
          globals: true,
          // .cjs only. ESM .mjs test files in this project failed to load on
          // Windows under vitest with "SyntaxError: Invalid or unexpected
          // token" (no line/column) even when the file was pure ASCII; the
          // worker pool change to 'forks' didn't help. CJS tests load
          // cleanly across all three OSes. The scripts being tested can
          // stay ESM — the .cjs test uses dynamic import() to load them.
          include: ['scripts/**/*.test.cjs'],
          // Explicitly no benches in this project.
          benchmark: {
            include: [],
          },
        },
      },
    ],
  },
})
