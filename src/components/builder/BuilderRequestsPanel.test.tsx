import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BuilderRequestsPanel } from './BuilderRequestsPanel'

beforeEach(() => cleanup())

describe('BuilderRequestsPanel', () => {
  it('shows "No manifest yet" when summary is null', () => {
    render(<BuilderRequestsPanel manifestSummary={null} errors={[]} />)
    expect(screen.getByText(/no manifest yet/i)).toBeTruthy()
  })
  it('renders capability chips', () => {
    render(<BuilderRequestsPanel manifestSummary={{ capabilities: ['activeDoc.read', 'ai'], network: [] }} errors={[]} />)
    expect(screen.getByText('activeDoc.read')).toBeTruthy()
    expect(screen.getByText('ai')).toBeTruthy()
  })
  it('renders network chips', () => {
    render(<BuilderRequestsPanel manifestSummary={{ capabilities: [], network: ['api.openai.com'] }} errors={[]} />)
    expect(screen.getByText('api.openai.com')).toBeTruthy()
  })
  it('shows "No outbound network" when network empty but manifest present', () => {
    render(<BuilderRequestsPanel manifestSummary={{ capabilities: ['notify'], network: [] }} errors={[]} />)
    expect(screen.getByText(/no outbound network/i)).toBeTruthy()
  })
  it('renders errors when present', () => {
    render(<BuilderRequestsPanel manifestSummary={null} errors={['manifest: id is required', 'files: entry missing']} />)
    expect(screen.getByText(/manifest: id is required/)).toBeTruthy()
    expect(screen.getByText(/files: entry missing/)).toBeTruthy()
  })
})
