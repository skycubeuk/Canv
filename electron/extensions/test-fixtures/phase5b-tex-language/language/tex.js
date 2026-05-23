// Canv injects CodeMirror primitives — bare `import` from '@codemirror/...'
// wouldn't resolve via canv-extension://. Take what you need from the deps
// argument instead.
export default function({ LanguageSupport, StreamLanguage }) {
  const tex = StreamLanguage.define({
    token(stream) {
      if (stream.match(/\\[a-zA-Z]+/)) return 'keyword'
      if (stream.match(/%.*/)) return 'comment'
      if (stream.match(/\$[^$]*\$/)) return 'string'
      stream.next()
      return null
    },
  })
  return new LanguageSupport(tex)
}
