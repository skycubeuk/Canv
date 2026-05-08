import { PanelBottom, PanelRight, PictureInPicture2 } from 'lucide-react'
import type { DockPlacement } from '../../hooks/useIdeLayout'

interface Props {
  placement: DockPlacement
  canPopOut: boolean
  onChange: (placement: DockPlacement) => void
  /**
   * Which placement buttons to render. Each surface chooses the subset that
   * makes sense for its context — the in-app dock header only needs the
   * popout action (the top bar covers dock placement); the popout window
   * only needs the re-dock actions (bottom/right) since it's already
   * popped out.
   */
  placements?: DockPlacement[]
}

interface ButtonDef {
  value: DockPlacement
  label: string
  Icon: typeof PanelBottom
}

const BUTTONS: ButtonDef[] = [
  { value: 'bottom', label: 'Dock at bottom', Icon: PanelBottom },
  { value: 'right', label: 'Dock at right', Icon: PanelRight },
  { value: 'popout', label: 'Pop out dock', Icon: PictureInPicture2 },
]

const DEFAULT_PLACEMENTS: DockPlacement[] = ['bottom', 'right', 'popout']

export function DockPlacementMenu({ placement, canPopOut, onChange, placements = DEFAULT_PLACEMENTS }: Props) {
  return (
    <div className="flex items-center gap-0.5 px-1" role="group" aria-label="Dock placement">
      {BUTTONS.map(({ value, label, Icon }) => {
        if (!placements.includes(value)) return null
        if (value === 'popout' && !canPopOut) return null
        const isActive = placement === value
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            title={label}
            onClick={() => onChange(value)}
            className={`px-1.5 py-1 rounded ${
              isActive
                ? 'text-default bg-active'
                : 'text-muted hover:bg-hover'
            }`}
          >
            <Icon aria-hidden className="w-3.5 h-3.5" />
          </button>
        )
      })}
    </div>
  )
}
