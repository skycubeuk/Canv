import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { ServicesContext } from '../services/useService'
import type { ICanvServices } from '../services'

/**
 * Stub builder for component tests that render under a ServicesProvider.
 * Tests opt into the services they need by passing them in `overrides`.
 * Unsupplied fields are typed as `ICanvServices[K]` but actually undefined;
 * any test that reaches into an unsupplied service will throw on access,
 * which surfaces missing test setup rather than hiding it behind a stub.
 */
export function makeStubServices(overrides: Partial<ICanvServices> = {}): ICanvServices {
  const stub: Record<string, unknown> = {
    workspace: undefined,
    settings: undefined,
    editorRegistry: undefined,
    commands: undefined,
    contributions: undefined,
    dialogs: undefined,
    notifications: undefined,
    ideLayout: undefined,
    modes: undefined,
    chatSessions: undefined,
    selectionAgent: undefined,
    lint: undefined,
    workspaceFileOps: undefined,
    editorStats: undefined,
    profilePicker: undefined,
  }
  Object.assign(stub, overrides)
  return stub as unknown as ICanvServices
}

/**
 * Render a React element under a stub ServicesProvider. Use for component
 * tests where the component calls useService(). Pass only the services
 * the component actually reads.
 */
export function renderWithServices(
  ui: ReactElement,
  services: Partial<ICanvServices> = {},
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  const stub = makeStubServices(services)
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesContext.Provider value={stub}>{children}</ServicesContext.Provider>
  )
  return render(ui, { wrapper: Wrapper, ...options })
}
