import { tabKey, isMarkdownTab, isDiffTab, isExtensionTab } from '../lib/tabKey'
import type { OpenTab, EditorGroupId } from '../types/workspace'
import { setTabDragPayload, readTabDragPayload, hasTabDragPayload } from './ide/dnd'
import React, { useState } from 'react'
import { GitBranch, Settings as SettingsIcon, X } from 'lucide-react'
import { useDialogs } from '../lib/dialogs'

interface Props {
  groupId: EditorGroupId
  tabs: OpenTab[]
  activeKey: string | null
  dirtySet: Set<string>
  onSelect: (key: string) => void
  onClose: (key: string) => void
  onDropTab: (sourceGroupId: EditorGroupId, key: string) => void
}

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

function tabLabel(t: OpenTab): React.ReactNode {
  if (isMarkdownTab(t)) return basename(t.relPath)
  if (isExtensionTab(t)) return basename(t.relPath)
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
  if (isExtensionTab(t)) return t.relPath
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
      role="tablist"
      aria-label={`Editor tabs ${groupId}`}
      data-testid={`editor-tablist-${groupId}`}
      onDragOver={handleStripDragOver}
      onDragLeave={handleStripDragLeave}
      onDrop={handleStripDrop}
      className={`shrink-0 flex items-center h-9 pl-1.5 bg-panel border-b border-default ${
        dragOver ? 'outline-solid outline-2 outline-[rgb(var(--border-strong))]' : ''
      }`}
    >
      <div className="tabs-scroller flex items-center overflow-x-auto overflow-y-hidden whitespace-nowrap min-w-0 h-full">
        {tabs.map((t) => {
          const key = tabKey(t)
          const active = key === activeKey
          const dirty = isMarkdownTab(t) && dirtySet.has(t.relPath)
          return (
            <div
              key={key}
              role="tab"
              data-testid={`editor-tab-${key}`}
              aria-selected={active}
              tabIndex={0}
              draggable
              onDragStart={(e) => setTabDragPayload(e, { sourceGroupId: groupId, key })}
              onClick={() => onSelect(key)}
              onMouseDown={(e) => {
                // Suppress Chromium's middle-button autoscroll cursor. The
                // close itself is deferred to onAuxClick so that the mouseup
                // lands on the tab (non-editable) instead of the editor that
                // would otherwise surface under the cursor — which on Linux
                // would trigger a primary-selection / clipboard paste.
                if (e.button === 1) e.preventDefault()
              }}
              onAuxClick={(e) => {
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
              className={`group relative flex items-center gap-2 px-2.5 h-9 border-r border-default text-[12px] cursor-pointer select-none ${
                active
                  ? 'bg-app text-default'
                  : 'text-muted hover:bg-hover'
              }`}
            >
              {active && (
                <span aria-hidden className="absolute top-0 left-0 right-0 h-0.5 bg-accent" />
              )}
              <span className="flex items-center gap-1 max-w-[180px] truncate">{tabLabel(t)}</span>
              {dirty && (
                <span
                  aria-hidden
                  className="w-[5px] h-[5px] rounded-full bg-[rgb(var(--text-muted))]"
                  title="Modified"
                />
              )}
              <button
                type="button"
                aria-label={`Close ${tabTitle(t)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void requestClose(key, dirty)
                }}
                className="opacity-0 group-hover:opacity-100 w-4 h-4 grid place-items-center rounded-sm text-subtle hover:bg-hover hover:text-default ml-0.5"
              >
                <X aria-hidden className="w-2.5 h-2.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

