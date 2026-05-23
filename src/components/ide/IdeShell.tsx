import type { ReactNode } from 'react'
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels'

export type DockSlot = 'bottom' | 'right' | 'none'

interface Props {
  sidebar: ReactNode
  sidebarVisible: boolean
  editor: ReactNode
  /** The dock content. Mounted in whichever slot `dockSlot` selects. */
  dock: ReactNode
  /** Where to render `dock` — or 'none' to suppress in-app rendering (e.g. when popped out). */
  dockSlot: DockSlot
  statusBar: ReactNode
  sidebarSize: number
  bottomSize: number
  rightSize: number
  onSidebarSizeChange?: (size: number) => void
  onBottomSizeChange?: (size: number) => void
  onRightSizeChange?: (size: number) => void
}

export function IdeShell(props: Props) {
  const {
    sidebar, sidebarVisible, editor, dock, dockSlot, statusBar,
    sidebarSize, bottomSize, rightSize,
    onSidebarSizeChange, onBottomSizeChange, onRightSizeChange,
  } = props

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <HorizontalShell
          sidebarVisible={sidebarVisible}
          dockSlot={dockSlot}
          sidebar={sidebar}
          editor={editor}
          dock={dock}
          sidebarSize={sidebarSize}
          bottomSize={bottomSize}
          rightSize={rightSize}
          onSidebarSizeChange={onSidebarSizeChange}
          onBottomSizeChange={onBottomSizeChange}
          onRightSizeChange={onRightSizeChange}
        />
      </div>
      {statusBar}
    </div>
  )
}

function HorizontalShell(props: {
  sidebarVisible: boolean
  dockSlot: DockSlot
  sidebar: ReactNode
  editor: ReactNode
  dock: ReactNode
  sidebarSize: number
  bottomSize: number
  rightSize: number
  onSidebarSizeChange?: (size: number) => void
  onBottomSizeChange?: (size: number) => void
  onRightSizeChange?: (size: number) => void
}) {
  const {
    sidebarVisible, dockSlot, sidebar, editor, dock,
    sidebarSize, bottomSize, rightSize,
    onSidebarSizeChange, onBottomSizeChange, onRightSizeChange,
  } = props

  // The "main" column = editor + (optional) right-side dock + (optional) bottom dock.
  // The wrapping <Group>/<Panel id="editorMain"> structure is rendered in every
  // dockSlot state so React reconciliation preserves the editor's component
  // identity across dock toggles. Only the trailing Separator + dock <Panel>
  // are conditionally rendered. Without this, switching dockSlot changes the
  // editor's parent type and unmounts the CodeMirror view, which discards
  // in-flight edits not yet persisted to tab.loadedMarkdown.
  const editorWithRight = (
    <Group
      orientation="horizontal"
      className="h-full w-full"
      defaultLayout={dockSlot === 'right'
        ? { editorMain: 100 - rightSize, dockRight: rightSize }
        : { editorMain: 100 }}
      onLayoutChanged={(layout: Layout) => {
        if (layout['dockRight'] !== undefined) onRightSizeChange?.(layout['dockRight'])
      }}
    >
      <Panel id="editorMain" minSize="40%" className="h-full min-w-0">
        {editor}
      </Panel>
      {dockSlot === 'right' && (
        <Separator className="w-px bg-border-default hover:bg-border-strong transition-colors cursor-col-resize" />
      )}
      {dockSlot === 'right' && (
        <Panel id="dockRight" minSize="20%" maxSize="50%" className="h-full">
          {dock}
        </Panel>
      )}
    </Group>
  )

  const main = (
    <Group
      orientation="vertical"
      className="h-full w-full"
      defaultLayout={dockSlot === 'bottom'
        ? { editor: 100 - bottomSize, bottom: bottomSize }
        : { editor: 100 }}
      onLayoutChanged={(layout: Layout) => {
        if (dockSlot === 'bottom' && layout['bottom'] !== undefined) onBottomSizeChange?.(layout['bottom'])
      }}
    >
      <Panel id="editor" minSize="30%" className="min-h-0">
        {editorWithRight}
      </Panel>
      {dockSlot === 'bottom' && (
        <Separator className="h-px bg-border-default hover:bg-border-strong transition-colors cursor-row-resize" />
      )}
      {dockSlot === 'bottom' && (
        <Panel id="bottom" minSize="15%" maxSize="70%" className="min-h-0">
          {dock}
        </Panel>
      )}
    </Group>
  )

  if (!sidebarVisible) {
    return main
  }

  const horizontalDefaultLayout: Layout = { sidebar: sidebarSize, main: 100 - sidebarSize }

  return (
    <Group
      orientation="horizontal"
      className="h-full w-full"
      defaultLayout={horizontalDefaultLayout}
      onLayoutChanged={(layout: Layout) => {
        if (layout['sidebar'] !== undefined) onSidebarSizeChange?.(layout['sidebar'])
      }}
    >
      <Panel id="sidebar" minSize="12%" maxSize="40%" className="h-full">
        {sidebar}
      </Panel>
      <Separator className="w-px bg-border-default hover:bg-border-strong transition-colors cursor-col-resize" />
      <Panel id="main" minSize="40%" className="h-full min-w-0">
        {main}
      </Panel>
    </Group>
  )
}
