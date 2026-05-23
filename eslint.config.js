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
])
