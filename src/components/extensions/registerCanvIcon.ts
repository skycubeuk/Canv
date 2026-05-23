import iconsRaw from '../../../electron/extensions/shared-assets/icons.json?raw'

const ICONS: Record<string, string> = JSON.parse(iconsRaw)
const NS = 'http://www.w3.org/2000/svg'

class CanvIconMain extends HTMLElement {
  static get observedAttributes() { return ['name', 'size'] }
  connectedCallback() { this.render() }
  attributeChangedCallback() { this.render() }
  render() {
    const name = this.getAttribute('name') || ''
    const size = Number(this.getAttribute('size')) || 16
    this.style.width = size + 'px'
    this.style.height = size + 'px'
    const pathData = ICONS[name]
    if (!pathData) { this.textContent = ''; return }
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    // Match lucide's 1.75 so extension-contributed activity-bar tabs look
    // visually consistent with the built-in tabs.
    svg.setAttribute('stroke-width', '1.75')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('width', String(size))
    svg.setAttribute('height', String(size))
    svg.innerHTML = pathData
    this.replaceChildren(svg)
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('canv-icon')) {
  customElements.define('canv-icon', CanvIconMain)
}
