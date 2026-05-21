import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    css: false,
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
          include: ['scripts/**/*.test.mjs'],
          // Explicitly no benches in this project.
          benchmark: {
            include: [],
          },
        },
      },
    ],
  },
})
