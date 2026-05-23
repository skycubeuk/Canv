declare module '*.yaml?raw' {
  const content: string
  export default content
}

declare module '*.md?raw' {
  const content: string
  export default content
}

declare module '*.json?raw' {
  const content: string
  export default content
}

declare const __APP_VERSION__: string
