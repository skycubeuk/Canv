import { forwardRef, type ReactNode, type MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'

const TITLE_CLS = 'text-[10.5px] font-semibold tracking-wider uppercase text-subtle'

export function SidebarHeader({
  title, actions,
}: { title: string; actions?: ReactNode }) {
  return (
    <header className="shrink-0 flex items-center justify-between px-side pt-2.5 pb-2 min-h-[40px]">
      <span className={TITLE_CLS}>{title}</span>
      {actions != null && <div className="flex gap-0.5">{actions}</div>}
    </header>
  )
}

export function SidebarSectionTitle({ children }: { children: ReactNode }) {
  return <div className={`${TITLE_CLS} px-side pt-1 pb-1`}>{children}</div>
}

export const SidebarIconButton = forwardRef<HTMLButtonElement, {
  'aria-label': string
  icon: LucideIcon
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  title?: string
  disabled?: boolean
}>(function SidebarIconButton({ 'aria-label': ariaLabel, icon: Icon, onClick, title, disabled }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="w-[22px] h-[22px] grid place-items-center rounded-sm text-subtle hover:bg-hover hover:text-default disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Icon aria-hidden className="w-3 h-3" />
    </button>
  )
})

export function SidebarRow({
  children, onClick, title,
}: {
  children: ReactNode
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="group w-full flex items-center gap-1.5 pr-2 pl-side py-[3px] text-[12.5px] rounded-sm text-muted hover:bg-hover hover:text-default transition-colors text-left"
    >
      {children}
    </button>
  )
}

export function SidebarRowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden className="w-3.5 h-3.5 shrink-0" />
}

export function SidebarMeta({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="text-[10px] font-mono text-subtle tabular-nums shrink-0">
      {children}
    </span>
  )
}

export function SidebarEmpty({ children }: { children: ReactNode }) {
  return <p className="px-side py-3 text-xs text-subtle">{children}</p>
}

export function SidebarPanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-default px-side py-2">
      {children}
    </div>
  )
}

/**
 * A row container for sidebar items that have leading icon buttons,
 * trailing icon buttons, or both — e.g. Sites rows (pin + name + menu)
 * and Extensions rows (chevron + toggle + name + menu).
 *
 * The leading slot's first element renders flush with the standard
 * sidebar indent (`pl-side`), so its left edge aligns with the header
 * title and section titles. This is the design system's alignment
 * contract for rows; it is enforced here so consumers cannot drift.
 *
 * Children fill the middle. They can be a single `<button>` for a
 * fully clickable row body, or a series of spans for a row whose
 * sub-elements are independently interactive (e.g. ExtensionRow).
 *
 * `menu` is rendered as a sibling of the row's inner flex layout,
 * inside the `<li>` which has `position: relative` — making the menu
 * easy to absolutely position relative to the row.
 */
export function SidebarRowFrame({
  leading, trailing, children, menu,
}: {
  leading?: ReactNode
  trailing?: ReactNode
  children: ReactNode
  menu?: ReactNode
}) {
  return (
    <li className="relative group">
      <div className="flex items-center pl-side pr-1">
        {leading}
        {children}
        {trailing}
      </div>
      {menu}
    </li>
  )
}
