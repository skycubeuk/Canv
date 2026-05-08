import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OutlinePanel } from './OutlinePanel'
import type { OutlineNode } from '../../../lib/outline'

const NODES: OutlineNode[] = [
  {
    id: '1:1',
    level: 1,
    text: 'Title',
    line: 1,
    index: 0,
    children: [
      {
        id: '2:3',
        level: 2,
        text: 'Section A',
        line: 3,
        index: 1,
        children: [
          { id: '3:5', level: 3, text: 'Sub 1', line: 5, index: 2, children: [] },
        ],
      },
      { id: '2:7', level: 2, text: 'Section B', line: 7, index: 3, children: [] },
    ],
  },
  { id: '1:9', level: 1, text: 'Appendix', line: 9, index: 4, children: [] },
]

describe('OutlinePanel', () => {
  it('renders all nodes when expanded', () => {
    render(
      <OutlinePanel
        nodes={NODES}
        resetKey="a"
        onJump={vi.fn()}
        collapsed={false}
        onToggleSectionCollapsed={vi.fn()}
      />,
    )
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Section A')).toBeInTheDocument()
    expect(screen.getByText('Sub 1')).toBeInTheDocument()
    expect(screen.getByText('Section B')).toBeInTheDocument()
    expect(screen.getByText('Appendix')).toBeInTheDocument()
  })

  it('does not render any nodes when collapsed', () => {
    render(
      <OutlinePanel
        nodes={NODES}
        resetKey="a"
        onJump={vi.fn()}
        collapsed={true}
        onToggleSectionCollapsed={vi.fn()}
      />,
    )
    expect(screen.queryByText('Title')).not.toBeInTheDocument()
  })

  it('clicking section header calls onToggleSectionCollapsed', () => {
    const onToggle = vi.fn()
    render(
      <OutlinePanel
        nodes={NODES}
        resetKey="a"
        onJump={vi.fn()}
        collapsed={false}
        onToggleSectionCollapsed={onToggle}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /outline/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('clicking a leaf node calls onJump with its node', () => {
    const onJump = vi.fn()
    render(
      <OutlinePanel
        nodes={NODES}
        resetKey="a"
        onJump={onJump}
        collapsed={false}
        onToggleSectionCollapsed={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Sub 1'))
    expect(onJump).toHaveBeenCalledWith(NODES[0].children[0].children[0])
  })

  it('clicking a parent node label calls onJump (not toggle)', () => {
    const onJump = vi.fn()
    render(
      <OutlinePanel
        nodes={NODES}
        resetKey="a"
        onJump={onJump}
        collapsed={false}
        onToggleSectionCollapsed={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Title'))
    expect(onJump).toHaveBeenCalledWith(NODES[0])
    expect(screen.getByText('Section A')).toBeInTheDocument()
  })

  it('clicking a parent chevron toggles its children', () => {
    const onJump = vi.fn()
    render(
      <OutlinePanel
        nodes={NODES}
        resetKey="a"
        onJump={onJump}
        collapsed={false}
        onToggleSectionCollapsed={vi.fn()}
      />,
    )
    expect(screen.getByText('Section A')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Toggle Title'))
    expect(screen.queryByText('Section A')).not.toBeInTheDocument()
    expect(onJump).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Toggle Title'))
    expect(screen.getByText('Section A')).toBeInTheDocument()
  })

  it('per-node collapse state resets when resetKey changes (file switch)', () => {
    const { rerender } = render(
      <OutlinePanel
        nodes={NODES}
        resetKey="a"
        onJump={vi.fn()}
        collapsed={false}
        onToggleSectionCollapsed={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByLabelText('Toggle Title'))
    expect(screen.queryByText('Section A')).not.toBeInTheDocument()

    rerender(
      <OutlinePanel
        nodes={NODES}
        resetKey="b"
        onJump={vi.fn()}
        collapsed={false}
        onToggleSectionCollapsed={vi.fn()}
      />,
    )
    expect(screen.getByText('Section A')).toBeInTheDocument()
  })

  it('per-node collapse state is preserved when nodes reference changes but resetKey is stable (live re-parse)', () => {
    const { rerender } = render(
      <OutlinePanel
        nodes={NODES}
        resetKey="a"
        onJump={vi.fn()}
        collapsed={false}
        onToggleSectionCollapsed={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByLabelText('Toggle Title'))
    expect(screen.queryByText('Section A')).not.toBeInTheDocument()

    const NODES_RECREATED: OutlineNode[] = [
      {
        id: '1:1',
        level: 1,
        text: 'Title',
        line: 1,
        index: 0,
        children: [
          {
            id: '2:3',
            level: 2,
            text: 'Section A',
            line: 3,
            index: 1,
            children: [
              { id: '3:5', level: 3, text: 'Sub 1', line: 5, index: 2, children: [] },
            ],
          },
          { id: '2:7', level: 2, text: 'Section B', line: 7, index: 3, children: [] },
        ],
      },
      { id: '1:9', level: 1, text: 'Appendix', line: 9, index: 4, children: [] },
    ]
    rerender(
      <OutlinePanel
        nodes={NODES_RECREATED}
        resetKey="a"
        onJump={vi.fn()}
        collapsed={false}
        onToggleSectionCollapsed={vi.fn()}
      />,
    )
    expect(screen.queryByText('Section A')).not.toBeInTheDocument()
  })
})
