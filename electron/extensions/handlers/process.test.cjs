const { ExtensionRuntime } = require('../runtime.cjs')
const { createProcessHandlers } = require('./process.cjs')
const { CapabilityError } = require('../capability.cjs')

function setup({ caps = ['process'], executables = ['pandoc'], execImpl = null } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext', manifest: { id: 'ext', capabilities: caps, executables },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  const calls = []
  const host = {
    execAllowed: async (binary, args) => {
      calls.push({ binary, args })
      return execImpl ? execImpl(binary, args) : { exitCode: 0, stdout: 'ok', stderr: '' }
    },
  }
  return { rt, calls, host, event: { sender: { id: 1 } },
    handlers: createProcessHandlers({ runtime: rt, host }) }
}

describe('process handlers', () => {
  it('requires the process capability', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:process.exec'](event, 'pandoc', []))
      .rejects.toBeInstanceOf(CapabilityError)
  })
  it('rejects a binary not in manifest.executables', async () => {
    const { handlers, event } = setup({ executables: ['pandoc'] })
    await expect(handlers['canvExt:process.exec'](event, 'rm', ['-rf', '/']))
      .rejects.toThrow(/not whitelisted/i)
  })
  it('rejects a non-string binary', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:process.exec'](event, 42, []))
      .rejects.toThrow(/binary must be a string/i)
  })
  it('rejects args that are not an array of strings', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:process.exec'](event, 'pandoc', 'nope'))
      .rejects.toThrow(/args/i)
    await expect(handlers['canvExt:process.exec'](event, 'pandoc', ['ok', 7]))
      .rejects.toThrow(/args/i)
  })
  it('forwards an allowed binary + args to host.execAllowed and returns the result', async () => {
    const { handlers, event, calls } = setup({
      execImpl: async () => ({ exitCode: 0, stdout: 'PDF written', stderr: '' }),
    })
    const r = await handlers['canvExt:process.exec'](event, 'pandoc', ['in.md', '-o', 'out.pdf'])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ binary: 'pandoc', args: ['in.md', '-o', 'out.pdf'] })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe('PDF written')
  })
})
