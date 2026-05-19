# Recipe: minimal-panel

Smallest possible working Canv extension — a left-sidebar panel that says "Hello from Canv".

## What it does

Registers a single panel contribution with no JS, no capabilities, and no external libraries. Static HTML only. Use this as the canonical sanity-check when testing a new Canv install or as the skeleton for any new panel extension.

## Files

```
hello-canv/
  manifest.json       # declares the extension and one panel contribution
  panels/main.html    # static HTML shown in the sidebar panel
```

## Setup steps

```bash
mkdir -p hello-canv/panels

# Write files (shown in full below), then install via Canv → Extensions tab → Install from folder
```

## Manifest

`hello-canv/manifest.json`

```json
{
  "id": "hello-canv",
  "name": "Hello Canv",
  "version": "0.1.0",
  "description": "Minimal panel — static HTML only.",
  "capabilities": [],
  "contributions": {
    "panels": [
      {
        "id": "hello-canv.main",
        "label": "Hello",
        "icon": "codicon-smiley",
        "location": "left-sidebar",
        "panel": "panels/main.html"
      }
    ]
  }
}
```

## Panel HTML

`hello-canv/panels/main.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- canv-ui.css is auto-injected; its CSS custom properties are available here -->
  <style>
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      font-family: var(--canv-font-sans, sans-serif);
      color: var(--canv-foreground, #ccc);
      background: var(--canv-panel-background, #1e1e1e);
    }
    h1 {
      font-size: 1rem;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <h1>Hello from Canv</h1>
</body>
</html>
```

## Known gotchas

- **No JS file needed.** Canv does not require a JS entry point — a panel can be pure HTML.
- **CSS variables.** Canv injects `canv-ui.css` into every panel iframe automatically. Use `var(--canv-*)` tokens for colours so the panel respects the user's theme.
- **`capabilities: []` is required** (not omitted). An absent key is treated identically to an empty array, but being explicit avoids surprises if Canv validation tightens in future.
- **`location`** options are `"left-sidebar"`, `"right-sidebar"`, and `"bottom"`. The sidebar icons appear in declaration order.
