import type { ReactNode } from 'react'
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels'
import { EditorGroup } from './EditorGroup'
import type { OpenTab, EditorGroupId, EditorGroupState } from '../../types/workspace'
import type { Action, Mode } from '../../config/types'

interface Props {
  workspaceRoot: string | null
  groups: EditorGroupState[]
  activeGroupId: EditorGroupId
  dirtySet: Set<string>
  onSelectTab: (groupId: EditorGroupId, key: string) => void
  onCloseTab: (groupId: EditorGroupId, key: string) => void
  onClickFolder?: (folderRel: string) => void
  onFocusGroup: (groupId: EditorGroupId) => void
  onMoveTab: (sourceGroupId: EditorGroupId, key: string, destGroupId: EditorGroupId) => void
  groupSizes: [number, number]
  onGroupSizesChange: (sizes: [number, number]) => void
  renderTabContent: (
    groupId: EditorGroupId,
    tab: OpenTab,
    isActive: boolean,
    viewMode: 'edit' | 'preview',
  ) => ReactNode
  emptyState: ReactNode
  profile: Mode
  onRunDocAgent: (groupId: EditorGroupId, agent: Action, instruction?: string) => void
}

export function EditorArea(props: Props) {
  const { groups } = props

  if (groups.length === 1) {
    return <SoloGroup {...props} />
  }
  return <SplitGroups {...props} />
}

function SoloGroup(props: Props) {
  const g = props.groups[0]
  return (
    <div className="h-full min-w-0">
      <EditorGroup
        groupId={g.id}
        isActive={props.activeGroupId === g.id}
        workspaceRoot={props.workspaceRoot}
        tabs={g.openTabs}
        activeKey={g.activeTabKey}
        dirtySet={props.dirtySet}
        onSelect={(key) => props.onSelectTab(g.id, key)}
        onClose={(key) => props.onCloseTab(g.id, key)}
        onClickFolder={props.onClickFolder}
        onFocusGroup={() => props.onFocusGroup(g.id)}
        onDropTab={(sourceGroupId, key) => props.onMoveTab(sourceGroupId, key, g.id)}
        renderTabContent={(tab, isActive, viewMode) =>
          props.renderTabContent(g.id, tab, isActive, viewMode)
        }
        emptyState={props.emptyState}
        profile={props.profile}
        onRunDocAgent={(agent, instruction) => props.onRunDocAgent(g.id, agent, instruction)}
      />
    </div>
  )
}

function SplitGroups(props: Props) {
  const [g1, g2] = props.groups
  const defaultLayout: Layout = { g1: props.groupSizes[0], g2: props.groupSizes[1] }
  return (
    <Group
      orientation="horizontal"
      className="h-full w-full"
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout) => {
        const a = layout.g1
        const b = layout.g2
        if (a !== undefined && b !== undefined) props.onGroupSizesChange([a, b])
      }}
    >
      <Panel id="g1" minSize="20%" className="h-full min-w-0">
        <EditorGroup
          groupId={g1.id}
          isActive={props.activeGroupId === g1.id}
          workspaceRoot={props.workspaceRoot}
          tabs={g1.openTabs}
          activeKey={g1.activeTabKey}
          dirtySet={props.dirtySet}
          onSelect={(key) => props.onSelectTab(g1.id, key)}
          onClose={(key) => props.onCloseTab(g1.id, key)}
          onClickFolder={props.onClickFolder}
          onFocusGroup={() => props.onFocusGroup(g1.id)}
          onDropTab={(sourceGroupId, key) => props.onMoveTab(sourceGroupId, key, g1.id)}
          renderTabContent={(tab, isActive, viewMode) =>
            props.renderTabContent(g1.id, tab, isActive, viewMode)
          }
          emptyState={props.emptyState}
          profile={props.profile}
          onRunDocAgent={(agent, instruction) => props.onRunDocAgent(g1.id, agent, instruction)}
        />
      </Panel>
      <Separator className="w-px bg-stone-200 dark:bg-neutral-800 hover:bg-stone-400 transition-colors cursor-col-resize" />
      <Panel id="g2" minSize="20%" className="h-full min-w-0">
        <EditorGroup
          groupId={g2.id}
          isActive={props.activeGroupId === g2.id}
          workspaceRoot={props.workspaceRoot}
          tabs={g2.openTabs}
          activeKey={g2.activeTabKey}
          dirtySet={props.dirtySet}
          onSelect={(key) => props.onSelectTab(g2.id, key)}
          onClose={(key) => props.onCloseTab(g2.id, key)}
          onClickFolder={props.onClickFolder}
          onFocusGroup={() => props.onFocusGroup(g2.id)}
          onDropTab={(sourceGroupId, key) => props.onMoveTab(sourceGroupId, key, g2.id)}
          renderTabContent={(tab, isActive, viewMode) =>
            props.renderTabContent(g2.id, tab, isActive, viewMode)
          }
          emptyState={props.emptyState}
          profile={props.profile}
          onRunDocAgent={(agent, instruction) => props.onRunDocAgent(g2.id, agent, instruction)}
        />
      </Panel>
    </Group>
  )
}
