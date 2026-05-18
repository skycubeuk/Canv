'use strict'

const { z } = require('zod')
const { ALL_CAPABILITIES } = require('./capability.cjs')

const ID_RE = /^[a-z][a-z0-9-]{0,63}$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/
const HOSTNAME_RE = /^(?!-)[a-z0-9.-]+(?<!-)$/i

const safeRelPath = z.string().refine((p) => {
  if (typeof p !== 'string' || p.length === 0) return false
  if (p.startsWith('/') || p.startsWith('\\') || /^[a-zA-Z]:/.test(p)) return false
  const normalized = p.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (normalized.split('/').some((seg) => seg === '..')) return false
  return true
}, { message: 'entry must be a relative path that does not escape the extension directory' })

const COMMAND_ID_RE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/
const FILE_EXT_RE = /^\.[a-z0-9]+$/
const KEYBINDING_RE = /^(?:(?:Ctrl|Cmd|CmdOrCtrl|Alt|Shift|Meta)\+)+[A-Za-z0-9]+(?:\s+(?:(?:Ctrl|Cmd|CmdOrCtrl|Alt|Shift|Meta)\+)*[A-Za-z0-9]+)?$/
const WHEN_RE = /^(?:fileExt:\.[a-z0-9]+|isDir|isFile)$/

const PanelContribution = z.object({
  type: z.literal('panel'),
  id: z.string().regex(ID_RE),
  title: z.string().min(1).max(80),
  icon: z.string().min(1).max(40),
  location: z.enum(['left-sidebar', 'bottom-dock']),
  entry: safeRelPath,
})

const FileHandlerContribution = z.object({
  type: z.literal('fileHandler'),
  id: z.string().regex(ID_RE),
  extensions: z.array(z.string().regex(FILE_EXT_RE)).min(1),
  mode: z.enum(['viewer', 'editor']),
  entry: safeRelPath,
})

const CommandContribution = z.object({
  type: z.literal('command'),
  id: z.string().regex(COMMAND_ID_RE),
  title: z.string().min(1).max(120),
  entry: safeRelPath,
  keybinding: z.string().regex(KEYBINDING_RE).optional(),
})

const MenuContribution = z.object({
  type: z.literal('menu'),
  menu: z.literal('fileTree.context'),
  command: z.string().regex(COMMAND_ID_RE),
  title: z.string().min(1).max(120).optional(),
  when: z.string().regex(WHEN_RE).optional(),
})

const StatusBarContribution = z.object({
  type: z.literal('statusBar'),
  id: z.string().regex(ID_RE),
  alignment: z.enum(['left', 'right']),
  priority: z.number().int().min(1).max(99),
  text: z.string().max(200).optional(),
  icon: z.string().max(40).optional(),
  tooltip: z.string().max(200).optional(),
  command: z.string().regex(COMMAND_ID_RE).optional(),
})

const LanguageContribution = z.object({
  type: z.literal('language'),
  extensions: z.array(z.string().regex(FILE_EXT_RE)).min(1),
  entry: safeRelPath,
})

const Contribution = z.discriminatedUnion('type', [
  PanelContribution,
  FileHandlerContribution,
  CommandContribution,
  MenuContribution,
  StatusBarContribution,
  LanguageContribution,
])

const Capability = z.string().refine((c) => ALL_CAPABILITIES.includes(c), {
  message: (ctx) => `unknown capability: ${ctx.input}`,
})

const NetworkOrigin = z.string().refine((h) => HOSTNAME_RE.test(h) && !h.includes('/'), {
  message: 'network entries must be bare hostnames (no scheme, no path)',
})

const SETTING_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

const SettingBase = {
  key: z.string().regex(SETTING_KEY_RE),
  label: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
}
const NumberSetting = z.object({ ...SettingBase, type: z.literal('number'), default: z.number().optional(), min: z.number().optional(), max: z.number().optional(), step: z.number().optional() })
const StringSetting = z.object({ ...SettingBase, type: z.literal('string'), default: z.string().optional(), max: z.number().optional() })
const BoolSetting   = z.object({ ...SettingBase, type: z.literal('boolean'), default: z.boolean().optional() })
const EnumSetting   = z.object({ ...SettingBase, type: z.literal('enum'), options: z.array(z.string().min(1)).min(1), default: z.string().optional() })
const ColorSetting  = z.object({ ...SettingBase, type: z.literal('color'), default: z.string().optional() })
const MultiSetting  = z.object({ ...SettingBase, type: z.literal('multiline'), default: z.string().optional() })
const PathSetting   = z.object({ ...SettingBase, type: z.literal('path'), default: z.string().optional() })

const SettingDef = z.discriminatedUnion('type', [
  NumberSetting, StringSetting, BoolSetting, EnumSetting, ColorSetting, MultiSetting, PathSetting,
]).superRefine((s, ctx) => {
  if (s.type === 'enum' && s.default != null && !s.options.includes(s.default)) {
    ctx.addIssue({ code: 'custom', message: `default "${s.default}" is not in options` })
  }
})

const ActivationEvent = z.string().refine((s) => {
  if (s === 'onStartup') return true
  if (/^onCommand:[a-zA-Z0-9._-]+$/.test(s)) return true
  if (/^onPanelOpen:(left-sidebar|bottom-dock):[a-zA-Z0-9._-]+$/.test(s)) return true
  return false
}, { message: 'unknown activation event' })

const MigrationStep = z.object({
  from: z.string().regex(/^\d+\.\d+\.\d+/),
  rename: z.record(z.string(), z.string()).optional(),
  drop: z.array(z.string()).optional(),
})

const ManifestSchema = z.object({
  id: z.string().regex(ID_RE),
  name: z.string().min(1).max(80),
  version: z.string().regex(SEMVER_RE),
  description: z.string().max(2000).optional(),
  author: z.string().max(80).optional(),
  createdAt: z.string().datetime().optional(),
  builderPrompt: z.string().max(5000).optional(),
  capabilities: z.array(Capability).default([]),
  network: z.array(NetworkOrigin).default([]),
  settings: z.array(SettingDef).default([]).superRefine((arr, ctx) => {
    const seen = new Set()
    for (const s of arr) {
      if (seen.has(s.key)) ctx.addIssue({ code: 'custom', message: `duplicate setting key "${s.key}"` })
      seen.add(s.key)
    }
  }),
  activationEvents: z.array(ActivationEvent).default([]),
  migrations: z.array(MigrationStep).default([]).optional(),
  contributions: z.array(Contribution).min(1, 'manifest must declare at least one contribution'),
})

function validateManifest(input) {
  const r = ManifestSchema.safeParse(input)
  if (r.success) return { ok: true, manifest: r.data }
  const errors = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
  return { ok: false, errors }
}

module.exports = { validateManifest, ManifestSchema }
