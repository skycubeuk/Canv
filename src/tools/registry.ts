import type { ToolSchema } from '../adapters/types'
import type { Tool } from './types'
import { listDirTool } from './handlers/listDir'
import { readFileTool } from './handlers/readFile'
import { searchWorkspaceTool } from './handlers/searchWorkspace'
import { createFileTool } from './handlers/createFile'
import { editFileTool } from './handlers/editFile'
import { deleteFileTool } from './handlers/deleteFile'
import { renameFileTool } from './handlers/renameFile'
import { createFolderTool } from './handlers/createFolder'
import { setTodosTool } from './handlers/setTodos'

const TOOLS: Tool[] = [
  listDirTool, readFileTool, searchWorkspaceTool,
  createFileTool, editFileTool, deleteFileTool, renameFileTool, createFolderTool,
  setTodosTool,
] as Tool[]

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

export function allTools(): Tool[] { return TOOLS }
export function getTool(name: string): Tool | undefined { return BY_NAME.get(name) }
export function mutatingNames(): string[] { return TOOLS.filter((t) => t.mutating).map((t) => t.name) }
export function toolSchemas(): ToolSchema[] {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
}
