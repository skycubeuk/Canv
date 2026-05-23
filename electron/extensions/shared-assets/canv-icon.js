// electron/extensions/shared-assets/canv-icon.js
// Custom element for Canv-style icons. Loads icons.json once; renders inline
// SVG using the icon's stored path data. The only sanctioned icon surface
// inside extensions — see design spec §6.

let ICONS_PROMISE = null

async function loadIcons() {
  if (!ICONS_PROMISE) {
    ICONS_PROMISE = fetch('canv-extension://canv-shared/icons.json')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('icons.json load failed')))
      .catch((e) => { ICONS_PROMISE = null; throw e })
  }
  return ICONS_PROMISE
}

const NS = 'http://www.w3.org/2000/svg'

class CanvIcon extends HTMLElement {
  static get observedAttributes() { return ['name', 'size'] }

  connectedCallback() { this.render() }
  attributeChangedCallback() { this.render() }

  async render() {
    const name = this.getAttribute('name') || ''
    const size = Number(this.getAttribute('size')) || 16
    this.style.width = size + 'px'
    this.style.height = size + 'px'

    let icons
    try { icons = await loadIcons() } catch { this.textContent = ''; return }
    const pathData = icons[name]
    if (!pathData) { this.textContent = ''; return }

    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('width', String(size))
    svg.setAttribute('height', String(size))
    // pathData is multiple SVG elements; insert via innerHTML for simplicity.
    // The data is sourced from a trusted Canv-shipped asset, not user input.
    svg.innerHTML = pathData

    this.replaceChildren(svg)
  }
}

if (!customElements.get('canv-icon')) {
  customElements.define('canv-icon', CanvIcon)
}
