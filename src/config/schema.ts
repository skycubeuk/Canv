import { z } from 'zod'

const ID_RE = /^[a-zA-Z0-9-]+$/
const FEEDBACK_HEADER_RE = /^\s*(?:ISSUES|NOTES)\s*:/im
const REWRITE_HEADER_RE = /^\s*(?:CORRECTED|SUGGESTED REWRITE)\s*:/im
const NOTES_HEADER_RE = /^\s*NOTES\s*:/im

const inputModeSchema = z.enum(['selection', 'document', 'selection-or-document'])
const outputModeSchema = z.enum(['replacement', 'feedback-and-rewrite', 'feedback-only'])
const groupSchema = z.enum(['core', 'presets'])

export const actionSchema = z
  .object({
    id: z.string().regex(ID_RE, 'must match /^[a-zA-Z0-9-]+$/'),
    label: z.string().min(1),
    icon: z.string().min(1),
    group: groupSchema,
    inputMode: inputModeSchema,
    outputMode: outputModeSchema,
    needsInstruction: z.boolean().optional().default(false),
    instructionPlaceholder: z.string().min(1).optional(),
    prompt: z.string().min(1),
  })
  .superRefine((a, ctx) => {
    if (a.needsInstruction && !a.instructionPlaceholder) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['instructionPlaceholder'],
        message: 'required when needsInstruction is true',
      })
    }
    if (!a.prompt.includes('{{text}}')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prompt'],
        message: 'must include {{text}} placeholder',
      })
    }
    if (a.needsInstruction && !a.prompt.includes('{{instruction}}')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prompt'],
        message: 'must include {{instruction}} placeholder when needsInstruction is true',
      })
    }
    if (a.outputMode === 'feedback-and-rewrite') {
      if (!FEEDBACK_HEADER_RE.test(a.prompt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prompt'],
          message: 'feedback-and-rewrite prompts must include an ISSUES: or NOTES: section header',
        })
      }
      if (!REWRITE_HEADER_RE.test(a.prompt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prompt'],
          message: 'feedback-and-rewrite prompts must include a CORRECTED: or SUGGESTED REWRITE: section header',
        })
      }
    }
    if (a.outputMode === 'feedback-only') {
      if (!NOTES_HEADER_RE.test(a.prompt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prompt'],
          message: 'feedback-only prompts must include a NOTES: section header (the parser looks for it)',
        })
      }
    }
  })

export const modeSchema = z.object({
  id: z.string().regex(ID_RE, 'must match /^[a-zA-Z0-9-]+$/'),
  label: z.string().min(1),
  icon: z.string().min(1),
  description: z.string().min(1),
  examples: z.string().min(1),
  order: z.number().int(),
  default: z.boolean().optional().default(false),
  chatSystemPrompt: z.string().min(1),
  actions: z.array(actionSchema).min(1, 'mode must have at least one action'),
})
