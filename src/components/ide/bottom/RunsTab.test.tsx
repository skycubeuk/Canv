import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunsTab } from './RunsTab'
import type { RunRecord } from '../../ResultsPanel'
import { ContextMenuProvider } from '../../../lib/contextMenu'
import { makeTestMode } from '../../../test/fixtures'

const testMode = makeTestMode()

// Provide a synchronous modes context — no async loading needed in unit tests.
vi.mock('../../../hooks/useModes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useModes')>()
  return {
    ...actual,
    useModes: () => ({ modes: [testMode], defaultModeId: 'test' }),
  }
})

const baseRun = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  id: 'r1',
  modeId: 'edit',
  agentId: 'rewrite',
  agentLabel: 'Rewrite',
  timestamp: Date.now(),
  status: 'done',
  sourceText: '',
  range: null,
  response: '',
  provider: 'anthropic',
  model: 'm-known',
  tokenUsage: { input: 1000, output: 500 },
  followups: [],
  ...overrides,
})

const noopProps = {
  activeId: null,
  onSelect: vi.fn(),
  onClose: vi.fn(),
  onApply: vi.fn(),
  onRerun: vi.fn(),
  onRefine: vi.fn(),
}

describe('RunsTab — per-run cost badge', () => {
  it('renders a $ badge when pricing resolves for the run model', () => {
    render(
      <ContextMenuProvider>
        <RunsTab
          {...noopProps}
          runs={[baseRun()]}
          pricingOverrides={{}}
          pricingDefaults={{ 'm-known': { input: 3, output: 15 } }}
        />
      </ContextMenuProvider>,
    )
    // 1000 * 3 / 1e6 + 500 * 15 / 1e6 = 0.003 + 0.0075 = 0.0105 → toFixed(3) = "0.011"
    expect(screen.getByText(/\$0\.011/)).toBeInTheDocument()
  })

  it('omits the badge when pricing is missing', () => {
    render(
      <ContextMenuProvider>
        <RunsTab
          {...noopProps}
          runs={[baseRun({ model: 'm-unknown' })]}
          pricingOverrides={{}}
          pricingDefaults={{ 'm-known': { input: 3, output: 15 } }}
        />
      </ContextMenuProvider>,
    )
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
  })

  it('omits the badge when tokenUsage is missing', () => {
    render(
      <ContextMenuProvider>
        <RunsTab
          {...noopProps}
          runs={[baseRun({ tokenUsage: undefined })]}
          pricingOverrides={{}}
          pricingDefaults={{ 'm-known': { input: 3, output: 15 } }}
        />
      </ContextMenuProvider>,
    )
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
  })
})
