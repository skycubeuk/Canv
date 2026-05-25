import type { ToolSchema } from '../adapters/types'
import type { Tool } from './types'
import { listDirTool } from './handlers/listDir'
import { readFileTool } from './handlers/readFile'
import { searchWorkspaceTool } from './handlers/searchWorkspace'
import { fileMetadataTool } from './handlers/file_metadata'
import { createFileTool } from './handlers/createFile'
import { editFileTool } from './handlers/editFile'
import { deleteFileTool } from './handlers/deleteFile'
import { renameFileTool } from './handlers/renameFile'
import { createFolderTool } from './handlers/createFolder'
import { setTodosTool } from './handlers/setTodos'
import { listAnnotationsTool } from './handlers/listAnnotations'
import { addAnnotationTool } from './handlers/addAnnotation'
import { updateAnnotationTool } from './handlers/updateAnnotation'
import { removeAnnotationTool } from './handlers/removeAnnotation'
import { siteRegisterTool } from './handlers/siteRegister'
import { siteUpdateTool } from './handlers/siteUpdate'
import { applyEditsTool } from './handlers/applyEdits'

const TOOLS: Tool[] = [
  listDirTool, readFileTool, searchWorkspaceTool, fileMetadataTool,
  createFileTool, editFileTool, applyEditsTool,
  deleteFileTool, renameFileTool, createFolderTool,
  setTodosTool,
  listAnnotationsTool, addAnnotationTool, updateAnnotationTool, removeAnnotationTool,
  siteRegisterTool, siteUpdateTool,
] as Tool[]

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

export function allTools(): Tool[] { return TOOLS }
export function getTool(name: string): Tool | undefined { return BY_NAME.get(name) }
export function mutatingNames(): string[] { return TOOLS.filter((t) => t.mutating).map((t) => t.name) }
export function toolSchemas(): ToolSchema[] {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
}
