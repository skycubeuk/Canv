import { FileTree } from '../../FileTree'
import type { DirNode } from '../../../lib/fs'

interface Props {
  root: string | null
  tree: DirNode | null
  truncated: boolean
  openRels: Set<string>
  activeRel: string | null
  pinnedRels: Set<string>
  onOpen: (rel: string) => void
  onPin: (rel: string) => void
  onUnpin: (rel: string) => void
  onCreateFile: (parentRel: string) => void
  onCreateFolder: (parentRel: string) => void
  onRename: (rel: string, newRel: string) => void
  onDelete: (rel: string) => void
  onChangeWorkspace: () => void
  selectedDir?: string
  onSelectDir?: (rel: string) => void
  revealRel?: string | null
  revisionArchaeologyEnabled?: boolean
  onViewHistory?: (rel: string) => void
  onOpenWith?: (rel: string, extensionId: string | null) => void
}

export function FilesTab(props: Props) {
  return (
    <FileTree
      key={props.root ?? '__none__'}
      root={props.root}
      tree={props.tree}
      truncated={props.truncated}
      openRels={props.openRels}
      activeRel={props.activeRel}
      pinnedRels={props.pinnedRels}
      onOpen={props.onOpen}
      onPin={props.onPin}
      onUnpin={props.onUnpin}
      onCreateFile={props.onCreateFile}
      onCreateFolder={props.onCreateFolder}
      onRename={props.onRename}
      onDelete={props.onDelete}
      onChangeWorkspace={props.onChangeWorkspace}
      selectedDir={props.selectedDir}
      onSelectDir={props.onSelectDir}
      revealRel={props.revealRel}
      revisionArchaeologyEnabled={props.revisionArchaeologyEnabled}
      onViewHistory={props.onViewHistory}
      onOpenWith={props.onOpenWith}
    />
  )
}
