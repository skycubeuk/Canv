# learn_manifest_full — Complete manifest reference

This doc covers the deep schema details for `manifest.settings` and `manifest.activationEvents`.
For the top-level field overview, see `_intro.md` (prepended to every response).

## Settings definitions — `manifest.settings`

Declare settings to expose user-configurable values in the extension settings UI.
Read and write them at runtime via `canv.settings.*` (requires `settings` capability).

### Shape

Each entry in `manifest.settings` is an object:

```json
{ "key": "refreshInterval", "type": "number",  "label": "Refresh interval (s)", "default": 5,       "min": 1, "max": 60 }
{ "key": "mode",            "type": "enum",    "label": "Mode",                  "default": "words", "options": ["words", "chars"] }
{ "key": "prompt",          "type": "string",  "label": "AI prompt",             "default": "" }
{ "key": "enabled",         "type": "boolean", "label": "Enabled",               "default": true }
{ "key": "apiKey",          "type": "string",  "label": "API key",               "default": "",      "secret": true }
{ "key": "accent",          "type": "color",   "label": "Accent colour",         "default": "#4f8ef7" }
{ "key": "systemPrompt",    "type": "multiline","label": "System prompt",         "default": "" }
{ "key": "workspacePath",   "type": "path",    "label": "Reference folder",      "default": "" }
```

### Type reference

| Type | UI control | Extra fields |
|---|---|---|
| `number` | Numeric input / stepper | `min`, `max`, `step` (all optional) |
| `string` | Single-line text input | — |
| `boolean` | Toggle switch | — |
| `enum` | Dropdown | `options: string[]` (required) |
| `color` | Colour picker | — |
| `multiline` | Multi-line textarea | — |
| `path` | Path input with browse button | — |

- `key` — used with `canv.settings.get(key)` / `set(key, value)`. Must be unique within the extension.
- `label` — shown in the settings UI. Keep it short.
- `default` — value used before the user changes the setting. Must match the type.
- `secret: true` — value is stored encrypted; masked in the UI. Use for API keys and tokens.

### Runtime API — requires `settings` capability

```js
const val   = await canv.settings.get('mode')           // → value or default
await canv.settings.set('mode', 'chars')
const all   = await canv.settings.getAll()              // → { key: value, ... }
const unsub = canv.settings.onChange((key, value) => {
  if (key === 'mode') applyMode(value)
})
canv.lifecycle.onUnload(() => unsub())
```

## Activation events — `manifest.activationEvents`

Canv infers activation events from contributions in most cases. Only declare `activationEvents` explicitly when you need behaviour that can't be inferred.

### Inferred automatically

| Contribution type | Inferred event |
|---|---|
| `panel` | `"onPanelOpen:<location>:<panelId>"` for each panel |
| `statusBar` | `"onStatusBarRender"` |
| `fileHandler` | `"onFileOpen:<ext>"` for each extension |
| `command` | `"onCommandInvoke:<id>"` for each command |
| `menu` | (no separate event — fires through the referenced command) |
| `language` | `"onLanguageLoad:<ext>"` for each extension |

### Explicit events

| Event | When it fires |
|---|---|
| `"onStartup"` | Immediately when Canv finishes loading, before any file opens |

Use `"onStartup"` only when your extension needs to run background setup before the user interacts.
Most extensions do not need it.

### Full example with explicit activation

```json
{
  "activationEvents": ["onStartup"],
  "contributions": [
    { "type": "statusBar", "id": "sync-status", "alignment": "right", "priority": 5, "text": "Syncing…", "entry": "statusbar/sync.js" }
  ]
}
```

The `"onStartup"` here ensures the sync entry script runs before any document opens,
even if the status bar hasn't rendered yet.

## Complete manifest example (all optional fields)

```json
{
  "manifest": {
    "id": "my-extension",
    "name": "My Extension",
    "version": "1.0.0",
    "description": "A fully-specified example. Needs net for weather API.",
    "capabilities": ["activeDoc.read", "events.docChanged", "storage", "settings", "net", "notify"],
    "network": ["api.openweathermap.org"],
    "activationEvents": ["onStartup"],
    "settings": [
      { "key": "apiKey",   "type": "string",  "label": "OpenWeather API key", "default": "", "secret": true },
      { "key": "city",     "type": "string",  "label": "City",                "default": "London" },
      { "key": "units",    "type": "enum",    "label": "Units",               "default": "metric", "options": ["metric", "imperial"] }
    ],
    "contributions": [
      { "type": "panel", "id": "weather", "title": "Weather", "icon": "info", "location": "left-sidebar", "entry": "panels/weather.html" }
    ]
  }
}
```

## Pitfalls

- **`secret: true` + `canv.settings.get`** — the value is decrypted for your extension; you can use it normally in code. Never log or display it.
- **`options` missing on `enum` type** — the settings UI renders a broken dropdown; always include `options`.
- **`default` type mismatch** — e.g. `"default": "5"` for a `number` type; Canv may coerce or reject it. Match the type.
- **`activationEvents` + inferred events** — explicitly declaring an event that would be inferred is harmless but redundant.
- **`"onStartup"` for everything** — slows Canv's boot. Only use it if you genuinely need pre-open setup.
