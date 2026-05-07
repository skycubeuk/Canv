import { PanelBottom, PanelRight, PictureInPicture2 } from 'lucide-react'
import type { DockPlacement } from '../../hooks/useIdeLayout'

interface Props {
  placement: DockPlacement
  canPopOut: boolean
  onChange: (placement: DockPlacement) => void
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

export function DockPlacementMenu({ placement, canPopOut, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 px-1" role="group" aria-label="Dock placement">
      {BUTTONS.map(({ value, label, Icon }) => {
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
