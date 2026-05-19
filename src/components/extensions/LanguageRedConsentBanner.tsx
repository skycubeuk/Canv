interface Props {
  extensionsHandled: string[]
}

export function LanguageRedConsentBanner({ extensionsHandled }: Props) {
  return (
    <div style={{
      background: 'rgb(180 60 60 / 18%)',
      border: '1px solid rgb(220 80 80)',
      borderRadius: 6,
      padding: 12,
      marginBottom: 12,
    }}>
      <div style={{ fontWeight: 600, color: 'rgb(255 140 140)', marginBottom: 6 }}>
        ⚠ This extension runs code in your editor
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-color-default)', lineHeight: 1.5 }}>
        When active, this extension can read and modify everything you type in <code>{extensionsHandled.join(', ')}</code> files. It runs with the same privileges as Canv itself.
        <br /><br />
        Only install if you trust the source.
      </div>
    </div>
  )
}
