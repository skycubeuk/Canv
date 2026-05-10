const { createParser } = require('./inotify-parser.cjs')

function collect(parser, chunks) {
  const events = []
  parser.onEvent((e) => events.push(e))
  for (const c of chunks) parser.feed(c)
  parser.flush()
  return events
}

describe('createParser', () => {
  it('maps CREATE on a file to add', () => {
    const p = createParser({ root: '/srv/x', now: () => 0 })
    expect(collect(p, ['CREATE /srv/x/a.md\n'])).toEqual([
      { type: 'add', relPath: 'a.md' },
    ])
  })
  it('maps CREATE,ISDIR to addDir', () => {
    const p = createParser({ root: '/srv/x', now: () => 0 })
    expect(collect(p, ['CREATE,ISDIR /srv/x/sub\n'])).toEqual([
      { type: 'addDir', relPath: 'sub' },
    ])
  })
  it('maps DELETE to unlink and DELETE,ISDIR to unlinkDir', () => {
    const p = createParser({ root: '/srv/x', now: () => 0 })
    expect(collect(p, [
      'DELETE /srv/x/a.md\n',
      'DELETE,ISDIR /srv/x/sub\n',
    ])).toEqual([
      { type: 'unlink', relPath: 'a.md' },
      { type: 'unlinkDir', relPath: 'sub' },
    ])
  })
  it('maps MODIFY/CLOSE_WRITE to change', () => {
    const p = createParser({ root: '/srv/x', now: () => 0 })
    expect(collect(p, ['MODIFY /srv/x/a.md\n', 'CLOSE_WRITE,CLOSE /srv/x/a.md\n']))
      .toEqual([{ type: 'change', relPath: 'a.md' }])
  })
  it('emits two changes when 50ms have elapsed between them', () => {
    let t = 0
    const p = createParser({ root: '/srv/x', now: () => t })
    const out = []
    p.onEvent((e) => out.push(e))
    p.feed('MODIFY /srv/x/a.md\n')
    t = 100
    p.feed('MODIFY /srv/x/a.md\n')
    p.flush()
    expect(out).toEqual([
      { type: 'change', relPath: 'a.md' },
      { type: 'change', relPath: 'a.md' },
    ])
  })
  it('expands MOVED_FROM + MOVED_TO into unlink+add', () => {
    const p = createParser({ root: '/srv/x', now: () => 0 })
    expect(collect(p, [
      'MOVED_FROM /srv/x/a.md\n',
      'MOVED_TO /srv/x/b.md\n',
    ])).toEqual([
      { type: 'unlink', relPath: 'a.md' },
      { type: 'add', relPath: 'b.md' },
    ])
  })
  it('handles split chunks across line boundaries', () => {
    const p = createParser({ root: '/srv/x', now: () => 0 })
    expect(collect(p, ['CREATE /srv/x', '/a.md\nMODIFY /srv/x/a.md\n']))
      .toEqual([
        { type: 'add', relPath: 'a.md' },
        { type: 'change', relPath: 'a.md' },
      ])
  })
  it('ignores .git and node_modules paths defensively', () => {
    const p = createParser({ root: '/srv/x', now: () => 0 })
    expect(collect(p, [
      'CREATE /srv/x/.git/HEAD\n',
      'CREATE /srv/x/node_modules/foo/index.js\n',
      'CREATE /srv/x/a.md\n',
    ])).toEqual([{ type: 'add', relPath: 'a.md' }])
  })
})
