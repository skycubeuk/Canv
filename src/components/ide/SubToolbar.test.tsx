import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SubToolbar } from './SubToolbar'

describe('SubToolbar', () => {
  it('renders breadcrumb segments separated by chevrons', () => {
    render(
      <SubToolbar
        workspaceName="UntitledBook"
        relPath="Book 1/ACT 1/003 Licensed Comforts.md"
        onClickFolder={vi.fn()}
        viewMode="edit"
        onChangeViewMode={vi.fn()}
        showViewToggle={true}
      />,
    )
    expect(screen.getByText('UntitledBook')).toBeInTheDocument()
    expect(screen.getByText('Book 1')).toBeInTheDocument()
    expect(screen.getByText('ACT 1')).toBeInTheDocument()
    expect(screen.getByText('003 Licensed Comforts.md')).toBeInTheDocument()
  })

  it('clicking a folder segment fires onClickFolder with that path', () => {
    const onClickFolder = vi.fn()
    render(
      <SubToolbar
        workspaceName="UntitledBook"
        relPath="Book 1/ACT 1/003.md"
        onClickFolder={onClickFolder}
        viewMode="edit"
        onChangeViewMode={vi.fn()}
        showViewToggle={true}
      />,
    )
    fireEvent.click(screen.getByText('ACT 1'))
    expect(onClickFolder).toHaveBeenCalledWith('Book 1/ACT 1')
  })

  it('renders Edit/Preview toggle and fires callback', () => {
    const onChange = vi.fn()
    render(
      <SubToolbar
        workspaceName="X"
        relPath="a.md"
        onClickFolder={vi.fn()}
        viewMode="edit"
        onChangeViewMode={onChange}
        showViewToggle={true}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(onChange).toHaveBeenCalledWith('preview')
  })

  it('hides the view toggle when showViewToggle is false', () => {
    render(
      <SubToolbar
        workspaceName="X"
        relPath="a.md"
        onClickFolder={vi.fn()}
        viewMode="edit"
        onChangeViewMode={vi.fn()}
        showViewToggle={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument()
  })
})
