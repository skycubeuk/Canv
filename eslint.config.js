import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import noRawColor from './eslint-rules/no-raw-color.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig([
  globalIgnores([
    'dist', 'release', 'node_modules', '.claude', '.superpowers', 'build',
    'coverage',
    'site/.astro',
    'site/src/env.d.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      canv: { rules: { 'no-raw-color': noRawColor } },
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      'canv/no-raw-color': 'error',
    },
  },
  // Exempt test and bench files — fixtures may use palette utilities.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.bench.{ts,tsx}'],
    rules: { 'canv/no-raw-color': 'off' },
  },
  // Electron main process and build scripts — plain JS under Node.
  {
    files: ['electron/**/*.cjs', 'scripts/**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Empty catch is an established idiom in this layer ("best-effort" fs ops).
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['electron/**/*.cjs', 'scripts/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  // The preload script runs in the renderer, so browser globals exist too.
  {
    files: ['electron/preload.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // Vitest suites reference describe/it/expect as globals.
  {
    files: ['electron/**/*.test.cjs', 'scripts/**/*.test.cjs'],
    languageOptions: {
      globals: { describe: 'readonly', it: 'readonly', expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly', vi: 'readonly' },
    },
  },
])
