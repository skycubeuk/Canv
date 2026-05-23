import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { InstallExtensionMenu } from './InstallExtensionMenu'

beforeEach(() => cleanup())

describe('InstallExtensionMenu', () => {
  it('starts collapsed; trigger button shows', () => {
    render(<InstallExtensionMenu onFromFolder={() => {}} onFromFile={() => {}} />)
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /from folder/i })).not.toBeInTheDocument()
  })

  it('opens menu when trigger clicked', () => {
    render(<InstallExtensionMenu onFromFolder={() => {}} onFromFile={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    expect(screen.getByRole('menuitem', { name: /from folder/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /from \.canvext/i })).toBeInTheDocument()
  })

  it('fires onFromFolder and closes menu', () => {
    const onFromFolder = vi.fn()
    render(<InstallExtensionMenu onFromFolder={onFromFolder} onFromFile={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /from folder/i }))
    expect(onFromFolder).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })

  it('fires onFromFile and closes menu', () => {
    const onFromFile = vi.fn()
    render(<InstallExtensionMenu onFromFolder={() => {}} onFromFile={onFromFile} />)
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /from \.canvext/i }))
    expect(onFromFile).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })

  it('Escape closes the menu', () => {
    render(<InstallExtensionMenu onFromFolder={() => {}} onFromFile={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('clicking the trigger a second time closes the menu (mousedown race guard)', () => {
    render(<InstallExtensionMenu onFromFolder={() => {}} onFromFile={() => {}} />)
    const trigger = screen.getByRole('button', { name: /install/i })
    fireEvent.mouseDown(trigger)
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(trigger)
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('outside click closes the menu', () => {
    render(<InstallExtensionMenu onFromFolder={() => {}} onFromFile={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
