import { describe, it, expect, vi } from 'vitest'
import { useEffect } from 'react'
import { render } from '@testing-library/react'
import { IdeShell } from './IdeShell'

// Stub the resizable-panels primitives to plain divs so we can observe the
// raw React tree IdeShell renders. The real library swallows children into
// internal contexts that vary by panel layout.
vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div data-testid="rp-group">{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div data-testid="rp-panel">{children}</div>,
  Separator: () => <div data-testid="rp-separator" />,
}))

// A sentinel that calls `onMount` once when it mounts. If IdeShell remounts
// the editor subtree on a sidebar toggle, this fires again.
function MountCounter({ onMount, label }: { onMount: () => void; label: string }) {
  useEffect(() => {
    onMount()
  }, [onMount])
  return <div>{label}</div>
}

describe('IdeShell — stability across sidebar toggle', () => {
  it('does not remount the main column when sidebarVisible flips', () => {
    const mounts = vi.fn()
    const Subject = ({ sidebarVisible }: { sidebarVisible: boolean }) => (
      <IdeShell
        sidebar={<div>SIDEBAR</div>}
        sidebarVisible={sidebarVisible}
        editor={<MountCounter onMount={mounts} label="editor" />}
        dock={<div>DOCK</div>}
        dockSlot="bottom"
        statusBar={<div>STATUS</div>}
        sidebarSize={20}
        bottomSize={30}
        rightSize={30}
      />
    )

    const { rerender } = render(<Subject sidebarVisible={true} />)
    expect(mounts).toHaveBeenCalledTimes(1)

    // The bug: toggling sidebar visibility used to unmount/remount the entire
    // main column (incl. editor, chat panel, etc.), losing component-local state.
    rerender(<Subject sidebarVisible={false} />)
    expect(mounts).toHaveBeenCalledTimes(1)

    rerender(<Subject sidebarVisible={true} />)
    expect(mounts).toHaveBeenCalledTimes(1)
  })

  it('does not remount the main column when toggled multiple times', () => {
    const mounts = vi.fn()
    const Subject = ({ sidebarVisible }: { sidebarVisible: boolean }) => (
      <IdeShell
        sidebar={<div>SIDEBAR</div>}
        sidebarVisible={sidebarVisible}
        editor={<MountCounter onMount={mounts} label="editor" />}
        dock={<div>DOCK</div>}
        dockSlot="bottom"
        statusBar={<div>STATUS</div>}
        sidebarSize={20}
        bottomSize={30}
        rightSize={30}
      />
    )

    const { rerender } = render(<Subject sidebarVisible={false} />)
    expect(mounts).toHaveBeenCalledTimes(1)
    rerender(<Subject sidebarVisible={true} />)
    rerender(<Subject sidebarVisible={false} />)
    rerender(<Subject sidebarVisible={true} />)
    expect(mounts).toHaveBeenCalledTimes(1)
  })
})
