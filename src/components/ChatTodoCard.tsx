interface TodoItem {
  content: string
  activeForm: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface ChatTodoCardProps {
  /** The raw JSON string returned by the set_todos tool result. */
  resultJson: string | undefined
}

interface ParsedResult {
  todos: TodoItem[]
}

function parse(resultJson: string | undefined): ParsedResult | 'malformed' | 'empty' {
  if (resultJson === undefined || resultJson === null || resultJson === '') return 'empty'
  try {
    const parsed = JSON.parse(resultJson) as Partial<ParsedResult>
    if (!Array.isArray(parsed.todos)) return 'malformed'
    if (parsed.todos.length === 0) return 'empty'
    return parsed as ParsedResult
  } catch {
    return 'malformed'
  }
}

export function ChatTodoCard({ resultJson }: ChatTodoCardProps) {
  const parsed = parse(resultJson)
  if (parsed === 'empty') return null
  if (parsed === 'malformed') {
    return (
      <div className="my-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
        Could not render todo list
      </div>
    )
  }
  return (
    <div
      data-testid="todo-card"
      className="my-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
    >
      <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-stone-500 dark:text-neutral-400">Plan</div>
      <ul className="flex flex-col gap-0.5">
        {parsed.todos.map((todo, i) => (
          <Item key={i} todo={todo} index={i} />
        ))}
      </ul>
    </div>
  )
}

function Item({ todo, index }: { todo: TodoItem; index: number }) {
  if (todo.status === 'in_progress') {
    return (
      <li
        data-testid={`todo-item-${index}`}
        className="flex items-center gap-1.5"
      >
        <span
          data-testid="todo-spinner"
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-current"
        />
        <span>{todo.activeForm}</span>
      </li>
    )
  }
  if (todo.status === 'completed') {
    return (
      <li
        data-testid={`todo-item-${index}`}
        className="flex items-center gap-1.5 line-through text-stone-400 dark:text-neutral-500"
      >
        <span aria-hidden>☑</span>
        <span>{todo.content}</span>
      </li>
    )
  }
  // Unknown status values fall through to the pending render — graceful degradation across schema changes.
  return (
    <li
      data-testid={`todo-item-${index}`}
      className="flex items-center gap-1.5 text-stone-500 dark:text-neutral-400"
    >
      <span aria-hidden>☐</span>
      <span>{todo.content}</span>
    </li>
  )
}
