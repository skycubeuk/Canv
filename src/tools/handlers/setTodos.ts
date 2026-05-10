import type { Tool } from '../types'

export interface TodoItem {
  content: string
  activeForm: string
  status: 'pending' | 'in_progress' | 'completed'
}

interface Input {
  todos: TodoItem[]
}

interface Output {
  todos: TodoItem[]
}

export const setTodosTool: Tool<Input, Output> = {
  name: 'set_todos',
  description:
    "Replace the agent's working todo list. Pass the COMPLETE list every time; " +
    'the previous list is fully overwritten. Use this to plan multi-step work ' +
    'before starting, and call again to flip status as you progress. ' +
    'Each item: content (imperative, e.g. "Add foo"), activeForm (gerund, e.g. "Adding foo"), ' +
    'status ("pending" | "in_progress" | "completed"). ' +
    'Exactly zero or one item may be "in_progress" at a time.',
  mutating: false,
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', minLength: 1 },
            activeForm: { type: 'string', minLength: 1 },
            status: { enum: ['pending', 'in_progress', 'completed'] },
          },
          required: ['content', 'activeForm', 'status'],
          additionalProperties: false,
        },
      },
    },
    required: ['todos'],
    additionalProperties: false,
  },
  async handler(input) {
    if (!Array.isArray(input.todos)) {
      throw new Error('set_todos: "todos" must be an array')
    }
    const todos = input.todos
    for (let i = 0; i < todos.length; i++) {
      const t: unknown = todos[i]
      if (!t || typeof t !== 'object' || Array.isArray(t)) {
        throw new Error(`set_todos: item at index ${i} must be an object`)
      }
      const item = t as Partial<TodoItem>
      if (typeof item.content !== 'string' || item.content.length === 0) {
        throw new Error(`set_todos: item at index ${i} requires non-empty "content"`)
      }
      if (typeof item.activeForm !== 'string' || item.activeForm.length === 0) {
        throw new Error(`set_todos: item at index ${i} requires non-empty "activeForm"`)
      }
      if (item.status !== 'pending' && item.status !== 'in_progress' && item.status !== 'completed') {
        throw new Error(`set_todos: item at index ${i} has invalid "status"; must be "pending" | "in_progress" | "completed"`)
      }
    }
    const inProgress = todos.filter((t: TodoItem) => t.status === 'in_progress')
    if (inProgress.length > 1) {
      throw new Error('set_todos: only one item may be in_progress at a time')
    }
    return { todos: input.todos }
  },
}
