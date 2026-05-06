import { tabKey, isMarkdownTab, isDiffTab } from '../lib/tabKey'
import type { OpenTab, EditorGroupId } from '../types/workspace'
import { setTabDragPayload, readTabDragPayload, hasTabDragPayload } from './ide/dnd'
import React, { useState } from 'react'
import { DocumentAgentMenu } from './DocumentAgentMenu'
import { EditorViewModeToggle } from './ide/EditorViewModeToggle'
import type { Action, Mode } from '../config/types'
import { GitBranch, Settings as SettingsIcon, X } from 'lucide-react'
import { useDialogs } from '../lib/dialogs'

type ViewMode = 'edit' | 'preview'

interface Props {
  groupId: EditorGroupId
  tabs: OpenTab[]
  activeKey: string | null
  dirtySet: Set<string>
  onSelect: (key: string) => void
  onClose: (key: string) => void
  onDropTab: (sourceGroupId: EditorGroupId, key: string) => void
  profile: Mode
  hasMarkdownTab: boolean
  onRunDocAgent: (agent: Action, instruction?: string) => void
  activeTabViewMode: ViewMode | null
  onChangeActiveTabViewMode: (mode: ViewMode) => void
}

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

function tabLabel(t: OpenTab): React.ReactNode {
  if (isMarkdownTab(t)) return basename(t.relPath)
  if (isDiffTab(t)) {
    return (
      <span className="inline-flex items-center gap-1">
        <GitBranch aria-hidden className="w-3 h-3" />
        Diff: {basename(t.relPath)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <SettingsIcon aria-hidden className="w-3 h-3" />
      Settings
    </span>
  )
}

function tabTitle(t: OpenTab): string {
  if (isMarkdownTab(t)) return t.relPath
  if (isDiffTab(t)) return `Diff: ${t.relPath} (${t.baseRef})`
  return 'Settings'
}

export function EditorTabs({
  groupId,
  tabs,
  activeKey,
  dirtySet,
  onSelect,
  onClose,
  onDropTab,
  profile,
  hasMarkdownTab,
  onRunDocAgent,
  activeTabViewMode,
  onChangeActiveTabViewMode,
}: Props) {
  const [dragOver, setDragOver] = useState(false)
  const dialogs = useDialogs()

  const requestClose = async (key: string, dirty: boolean) => {
    if (dirty) {
      const ok = await dialogs.confirm({
        title: 'Discard changes?',
        message: `Discard unsaved changes to "${key}"?`,
        confirmLabel: 'Discard',
        danger: true,
      })
      if (!ok) return
    }
    onClose(key)
  }

  const handleStripDragOver = (e: React.DragEvent) => {
    if (!hasTabDragPayload(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }
  const handleStripDragLeave = () => setDragOver(false)
  const handleStripDrop = (e: React.DragEvent) => {
    setDragOver(false)
    const payload = readTabDragPayload(e)
    if (!payload) return
    e.preventDefault()
    if (payload.sourceGroupId === groupId) return
    onDropTab(payload.sourceGroupId, payload.key)
  }

  return (
    <div
      onDragOver={handleStripDragOver}
      onDragLeave={handleStripDragLeave}
      onDrop={handleStripDrop}
      className={`shrink-0 flex items-stretch justify-between border-b border-stone-200 dark:border-neutral-800 bg-stone-100 dark:bg-neutral-900 ${
        dragOver ? 'outline outline-2 outline-stone-400 dark:outline-neutral-500' : ''
      } ${tabs.length === 0 ? 'h-7' : ''}`}
    >
      <div className="flex items-stretch overflow-x-auto whitespace-nowrap min-w-0">
        {tabs.map((t) => {
          const key = tabKey(t)
          const active = key === activeKey
          const dirty = isMarkdownTab(t) && dirtySet.has(t.relPath)
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(e) => setTabDragPayload(e, { sourceGroupId: groupId, key })}
              onClick={() => onSelect(key)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  void requestClose(key, dirty)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(key)
                }
              }}
              title={tabTitle(t)}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-stone-200 dark:border-neutral-800 select-none ${
                active
                  ? 'bg-white dark:bg-neutral-950 text-stone-900 dark:text-neutral-100'
                  : 'text-stone-600 dark:text-neutral-400 hover:bg-stone-200/60 dark:hover:bg-neutral-800/60'
              }`}
            >
              <span className="flex items-center gap-1 max-w-[180px] truncate">{tabLabel(t)}</span>
              {dirty && (
                <span
                  aria-hidden
                  className="w-1.5 h-1.5 rounded-full bg-stone-500 dark:bg-neutral-400"
                  title="Unsaved"
                />
              )}
              <button
                type="button"
                aria-label={`Close ${tabTitle(t)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void requestClose(key, dirty)
                }}
                className="ml-1 w-4 h-4 inline-flex items-center justify-center rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200 dark:hover:text-neutral-100 dark:hover:bg-neutral-700"
              >
                <X aria-hidden className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex items-stretch shrink-0">
        {activeTabViewMode !== null && (
          <EditorViewModeToggle
            mode={activeTabViewMode}
            onChange={onChangeActiveTabViewMode}
          />
        )}
        <DocumentAgentMenu
          profile={profile}
          hasMarkdownTab={hasMarkdownTab}
          onRunAgent={onRunDocAgent}
        />
      </div>
    </div>
  )
}

