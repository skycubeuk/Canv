interface Props {
  text?: string
  icon?: string
  tooltip?: string
  command?: string
  onCommandInvoke?: (commandId: string) => void
}

export function StatusBarItem({ text, icon, tooltip, command, onCommandInvoke }: Props) {
  const content = (
    <>
      {icon && <canv-icon name={icon} size={11} />}
      {icon && text ? <span style={{ marginLeft: 4 }}>{text}</span> : text}
    </>
  )
  if (command && onCommandInvoke) {
    return (
      <button
        type="button"
        title={tooltip}
        onClick={() => onCommandInvoke(command)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: '0 8px', display: 'inline-flex', alignItems: 'center' }}
      >{content}</button>
    )
  }
  return <span title={tooltip} style={{ padding: '0 8px', display: 'inline-flex', alignItems: 'center' }}>{content}</span>
}
