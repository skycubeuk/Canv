interface Props {
  extensionsHandled: string[]
}

export function LanguageRedConsentBanner({ extensionsHandled }: Props) {
  return (
    <div className="bg-danger-soft border border-danger rounded-sm p-3 mb-3 text-xs text-default">
      <div className="font-medium mb-1.5 text-danger-fg">
        ⚠ This extension runs code in your editor
      </div>
      <div className="text-muted leading-relaxed">
        When active, this extension can read and modify everything you type in <code>{extensionsHandled.join(', ')}</code> files. It runs with the same privileges as Canv itself.
        <br /><br />
        Only install if you trust the source.
      </div>
    </div>
  )
}
