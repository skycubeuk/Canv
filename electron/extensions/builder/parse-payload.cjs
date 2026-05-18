'use strict'

const { validateManifest } = require('../manifest-schema.cjs')

// Strip markdown code fences if present. Handles ```json ... ``` and ``` ... ```.
function extractJson(text) {
  // Try fenced block first.
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  if (fenceMatch) return fenceMatch[1].trim()
  // Else find the first { ... } that looks like a JSON object.
  const firstBrace = text.indexOf('{')
  if (firstBrace === -1) return null
  const lastBrace = text.lastIndexOf('}')
  if (lastBrace <= firstBrace) return null
  return text.slice(firstBrace, lastBrace + 1).trim()
}

function parsePayload(rawText) {
  if (typeof rawText !== 'string') {
    return { ok: false, errors: ['payload must be a string'] }
  }
  const jsonText = extractJson(rawText)
  if (!jsonText) {
    return { ok: false, errors: ['no JSON object found in AI response'] }
  }
  let parsed
  try { parsed = JSON.parse(jsonText) }
  catch (e) { return { ok: false, errors: [`JSON parse failed: ${e.message}`] } }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['payload must be a JSON object'] }
  }
  if (!parsed.manifest || typeof parsed.manifest !== 'object') {
    return { ok: false, errors: ['payload.manifest is missing or not an object'] }
  }
  if (!parsed.files || typeof parsed.files !== 'object') {
    return { ok: false, errors: ['payload.files is missing or not an object'] }
  }

  // Validate file values are strings.
  for (const [p, content] of Object.entries(parsed.files)) {
    if (typeof content !== 'string') {
      return { ok: false, errors: [`payload.files["${p}"] must be a string`] }
    }
  }

  // Validate manifest via existing schema.
  const v = validateManifest(parsed.manifest)
  if (!v.ok) {
    return { ok: false, errors: v.errors.map((e) => `manifest: ${e}`) }
  }

  // Confirm each contribution.entry exists in files.
  const contribs = Array.isArray(v.manifest.contributions) ? v.manifest.contributions : []
  for (const c of contribs) {
    if (c.entry && !(c.entry in parsed.files)) {
      return { ok: false, errors: [`contribution "${c.id}" entry "${c.entry}" missing from files map`] }
    }
  }

  return { ok: true, payload: { manifest: v.manifest, files: parsed.files } }
}

module.exports = { parsePayload, extractJson }
