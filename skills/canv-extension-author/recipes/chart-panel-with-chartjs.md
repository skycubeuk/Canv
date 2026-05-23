# Recipe: chart-panel-with-chartjs

A sidebar panel that renders a Chart.js chart from YAML frontmatter in the active markdown document.

## What it does

Reads the active doc text, extracts YAML frontmatter (no library — split on `---` and parse line by line), and renders the declared chart. Updates live as the user edits. Chart.js is bundled locally via its `auto` entry, which auto-registers all chart types.

## Files

```
chart-panel/
  manifest.json         # panel contribution
  panels/main.html      # panel iframe; loads main.js
  panels/main.js        # frontmatter parser + Chart.js render
  vendor/chart.js.js    # Chart.js bundled for the browser (generated)
```

## Setup steps

```bash
mkdir -p chart-panel/{panels,vendor}
cd chart-panel

npm init -y
npm install chart.js

# chart.js "auto" entry registers all controllers, scales, and plugins.
# Use this instead of the bare entry to avoid manual registerElement() calls.
npx esbuild \
  --bundle \
  --format=esm \
  --platform=browser \
  --outfile=vendor/chart.js.js \
  node_modules/chart.js/auto/auto.js

# Write the remaining files (shown below), then:
# Canv → Extensions tab → Install from folder → select chart-panel/
```

## Example markdown document

Create a file `demo.md` with this content to test the panel:

```markdown
---
chart:
  type: bar
  label: "Monthly sales"
  labels: ["Jan", "Feb", "Mar", "Apr", "May"]
  data: [42, 58, 37, 71, 65]
  color: "#4e9cf5"
---

# Sales report

The chart above shows monthly figures for Q1–Q2.
```

## Manifest

`chart-panel/manifest.json`

```json
{
  "id": "chart-panel",
  "name": "Chart Panel",
  "version": "0.1.0",
  "description": "Renders a Chart.js chart from YAML frontmatter in the active markdown file.",
  "capabilities": ["activeDoc.read", "events.docChanged"],
  "contributions": {
    "panels": [
      {
        "id": "chart-panel.main",
        "label": "Chart",
        "icon": "codicon-graph",
        "location": "right-sidebar",
        "panel": "panels/main.html"
      }
    ]
  }
}
```

## Panel HTML

`chart-panel/panels/main.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 1rem;
      background: var(--canv-panel-background, #1e1e1e);
      color: var(--canv-foreground, #ccc);
      font-family: var(--canv-font-sans, sans-serif);
      font-size: 0.8rem;
    }
    #message {
      color: var(--canv-foreground-muted, #999);
      font-style: italic;
      margin-top: 2rem;
      text-align: center;
    }
    #chart-wrap {
      position: relative;
      width: 100%;
    }
  </style>
</head>
<body>
  <div id="chart-wrap"><canvas id="chart-canvas"></canvas></div>
  <div id="message">Open a markdown file with chart frontmatter.</div>
  <script type="module" src="main.js"></script>
</body>
</html>
```

## Panel JS

`chart-panel/panels/main.js`

```js
import Chart from '../vendor/chart.js.js'

const canvas  = document.getElementById('chart-canvas')
const message = document.getElementById('message')
let chartInstance = null

// ---------------------------------------------------------------------------
// Minimal YAML frontmatter parser — handles the subset used by this recipe.
// Supports: string, number, and inline arrays ("["a","b"]" or "[1,2,3]").
// ---------------------------------------------------------------------------
function parseFrontmatter(docText) {
  const lines = docText.split('\n')
  if (lines[0].trim() !== '---') return null

  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (endIdx === -1) return null

  const yamlLines = lines.slice(1, endIdx)
  const root = {}
  let currentSection = null

  for (const raw of yamlLines) {
    // Skip blank lines and comments.
    if (!raw.trim() || raw.trim().startsWith('#')) continue

    const indent = raw.match(/^(\s*)/)[1].length
    const content = raw.trim()

    if (indent === 0) {
      // Top-level key (possibly with a value).
      const colonIdx = content.indexOf(':')
      if (colonIdx === -1) continue
      const key = content.slice(0, colonIdx).trim()
      const val = content.slice(colonIdx + 1).trim()
      if (val) {
        root[key] = parseScalar(val)
        currentSection = null
      } else {
        root[key] = {}
        currentSection = key
      }
    } else if (currentSection) {
      // Indented key under the current section.
      const colonIdx = content.indexOf(':')
      if (colonIdx === -1) continue
      const key = content.slice(0, colonIdx).trim()
      const val = content.slice(colonIdx + 1).trim()
      root[currentSection][key] = parseScalar(val)
    }
  }

  return root
}

function parseScalar(s) {
  // Inline array: ["a","b"] or [1,2,3]
  if (s.startsWith('[') && s.endsWith(']')) {
    return s
      .slice(1, -1)
      .split(',')
      .map(item => {
        const t = item.trim().replace(/^["']|["']$/g, '')
        return isNaN(t) ? t : Number(t)
      })
  }
  // Quoted string
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  // Number
  if (!isNaN(s) && s !== '') return Number(s)
  // Boolean
  if (s === 'true') return true
  if (s === 'false') return false
  return s
}

// ---------------------------------------------------------------------------
// Chart rendering
// ---------------------------------------------------------------------------
function showMessage(text) {
  message.textContent = text
  message.style.display = 'block'
  canvas.style.display = 'none'
}

function hideMessage() {
  message.style.display = 'none'
  canvas.style.display = 'block'
}

function renderChart(cfg) {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  hideMessage()

  chartInstance = new Chart(canvas, {
    type: cfg.type || 'bar',
    data: {
      labels: cfg.labels || [],
      datasets: [{
        label: cfg.label || '',
        data: cfg.data || [],
        backgroundColor: cfg.color || '#4e9cf5',
        borderColor: cfg.color || '#4e9cf5',
        borderWidth: cfg.type === 'line' ? 2 : 0,
        fill: false,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--canv-foreground') || '#ccc' } }
      },
      scales: cfg.type !== 'pie' && cfg.type !== 'doughnut' ? {
        x: { ticks: { color: '#999' }, grid: { color: '#333' } },
        y: { ticks: { color: '#999' }, grid: { color: '#333' } }
      } : {}
    }
  })
}

async function update() {
  let text = ''
  try {
    text = await canv.activeDoc.getText()
  } catch {
    showMessage('No document open.')
    return
  }

  const fm = parseFrontmatter(text)
  if (!fm || !fm.chart) {
    showMessage('No chart frontmatter found. Add a "chart:" block at the top of the file.')
    return
  }

  renderChart(fm.chart)
}

update()
canv.events.on('activeDocChanged', update)
canv.events.on('docChanged', update)
```

## Known gotchas

- **Use `chart.js/auto/auto.js` as the esbuild entry point**, not `chart.js/dist/chart.esm.js`. The `auto` entry calls `Chart.register(...)` for all built-in controllers and plugins, so you get `bar`, `line`, `pie`, `doughnut`, etc. without any extra setup code.
- **`chart.js.js` as the output filename** is intentional (dots in the package name, `.js` extension). Import it as `'../vendor/chart.js.js'`.
- **Destroy before re-render.** Calling `new Chart(canvas, ...)` without destroying the previous instance throws a Chart.js warning and causes a memory leak. Always call `chartInstance.destroy()` first.
- **The canvas element must not have `display:none` when `new Chart(...)` is called.** Chart.js measures the canvas; if it is hidden, dimensions come back as zero. This recipe shows/hides via a sibling `#message` div instead, so the canvas is always in the DOM and only toggled after the chart is created.
- **YAML parsing is intentionally minimal.** The inline parser here handles the `chart:` block used in this recipe. For richer frontmatter (nested keys, multi-line strings, anchors), pull in `js-yaml` and bundle it the same way as `marked` in the markdown-rendering-panel recipe.
- **Color values** in frontmatter should be CSS color strings (`"#4e9cf5"`, `"rgba(78,156,245,0.5)"`). Chart.js passes them directly to the Canvas 2D API.
