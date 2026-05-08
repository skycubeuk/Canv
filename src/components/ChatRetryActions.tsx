import { useEffect, useState } from 'react'

export type RetryActionKind = 'cancelled-or-error' | 'denied-tool' | 'earlier-anchor'

interface Props {
  kind: RetryActionKind
  disabled: boolean
  disabledReason?: string
  /** When set, the Retry button is disabled until the countdown elapses, and
   *  its label shows "Retry in Ns". Used for 429 retry-after. */
  retryAfterSeconds?: number
  onRetry: () => void
  onEditAndRetry?: () => void
  /** When set, adds `data-{primaryDataAttr}` to the primary Retry button so
   *  callers (e.g. the chat panel's keyboard shortcut) can target it via a
   *  CSS attribute selector. */
  primaryDataAttr?: string
}

export function ChatRetryActions({
  kind, disabled, disabledReason, retryAfterSeconds, onRetry, onEditAndRetry,
  primaryDataAttr,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState<number>(retryAfterSeconds ?? 0)
  const [lastRetryAfter, setLastRetryAfter] = useState<number | undefined>(retryAfterSeconds)
  if (lastRetryAfter !== retryAfterSeconds) {
    // Prop changed — reset the countdown synchronously during render. React
    // supports setState during render when deriving state from changed props.
    setLastRetryAfter(retryAfterSeconds)
    setSecondsLeft(retryAfterSeconds ?? 0)
  }

  useEffect(() => {
    if (!retryAfterSeconds) return
    const id = window.setInterval(() => {
      setSecondsLeft((n) => (n <= 1 ? 0 : n - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [retryAfterSeconds])

  const cooldown = secondsLeft > 0
  const retryDisabled = disabled || cooldown
  const retryLabel = cooldown
    ? `Retry in ${secondsLeft}s`
    : kind === 'denied-tool'
      ? 'Retry whole turn'
      : kind === 'earlier-anchor'
        ? 'Retry from here'
        : 'Retry'

  const title = disabled ? disabledReason : undefined

  const primaryAttrs: Record<string, string> = {}
  if (primaryDataAttr) primaryAttrs[`data-${primaryDataAttr}`] = ''

  return (
    <div className="chat-retry-actions" role="group" aria-label="Retry actions">
      <button
        {...primaryAttrs}
        type="button"
        onClick={onRetry}
        disabled={retryDisabled}
        title={title}
      >
        {retryLabel}
      </button>
      {onEditAndRetry && kind !== 'earlier-anchor' && (
        <button
          type="button"
          onClick={onEditAndRetry}
          disabled={disabled}
          title={title}
        >
          Edit & retry
        </button>
      )}
    </div>
  )
}
