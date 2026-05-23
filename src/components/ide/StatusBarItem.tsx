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
      {icon && text ? <span className="ml-1">{text}</span> : text}
    </>
  )
  if (command && onCommandInvoke) {
    return (
      <button
        type="button"
        title={tooltip}
        onClick={() => onCommandInvoke(command)}
        className="bg-transparent border-0 cursor-pointer text-inherit font-inherit px-2 inline-flex items-center hover:text-default"
      >{content}</button>
    )
  }
  return <span title={tooltip} className="px-2 inline-flex items-center">{content}</span>
}
