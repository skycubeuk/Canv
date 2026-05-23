import { RuleTester } from 'eslint'
import rule from './no-raw-color.js'

const ruleTester = new RuleTester({
  languageOptions: {
    parser: await import('@typescript-eslint/parser'),
    parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  },
})

ruleTester.run('no-raw-color', rule, {
  valid: [
    { code: '<div className="bg-app text-default" />' },
    { code: '<div className="bg-success-soft text-success-fg" />' },
    { code: '<div className="bg-[rgb(var(--accent))]" />' },
    { code: '<div className="accent-[rgb(var(--accent))]" />' },
    { code: '<div className="border-border-strong" />' },
    { code: '<div style={{ backgroundColor: "rgb(var(--accent))" }} />' },
  ],
  invalid: [
    {
      code: '<div className="bg-red-500" />',
      errors: [{ message: /raw palette utility/ }],
    },
    {
      code: '<div className="text-emerald-700 bg-amber-950" />',
      errors: 2,
    },
    {
      code: '<div className="text-[#ff0000]" />',
      errors: [{ message: /hex/ }],
    },
    {
      code: '<div className="bg-[rgb(60_65_75)]" />',
      errors: [{ message: /numeric rgb/ }],
    },
    {
      code: '<div style={{ color: "#abc123" }} />',
      errors: [{ message: /hex/ }],
    },
    {
      code: '<div style={{ background: "rgba(0,0,0,0.4)" }} />',
      errors: [{ message: /numeric rgb/ }],
    },
  ],
})

console.log('no-raw-color: all RuleTester cases passed')
