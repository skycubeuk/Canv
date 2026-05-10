# Canv

A local-first markdown writing workspace with pluggable AI agents (Anthropic
and OpenAI). Pick a profile (fiction, technical, factual), open a folder of
markdown files, and run agents over a selection or the whole document — with
streaming output, an inline diff, and a one-click apply.

![Canv canvas with floating toolbar](docs/screenshots/the-editor/floating-toolbar.png)

## Install

Pre-built binaries are on the [Releases page](https://github.com/skycubeuk/Canv/releases).

| Platform | Artifact | First-launch note |
|----------|----------|-------------------|
| macOS | `.dmg` (Intel and Apple Silicon) | Build is unsigned. Right-click the app → **Open** to bypass Gatekeeper the first time. |
| Windows | NSIS `.exe` installer or portable `.exe` | SmartScreen warns "publisher unknown" — click **More info → Run anyway**. |
| Linux | `.AppImage`, `.deb`, or `.rpm` | `chmod +x` the AppImage, or `sudo dpkg -i canv_*.deb`. |

System requirements: macOS 10.15+, Windows 10+, glibc 2.28+ on Linux.

## Using Canv

The full user guide lives in [`docs/`](docs/README.md). Start with
[Getting started](docs/getting-started.md).

## Privacy

Canv has no backend. API keys are stored locally; the app talks directly to
`api.anthropic.com` and `api.openai.com` from your machine. Documents and
metadata live on disk in the workspace folder you choose. There is no
telemetry.

## Development

```bash
npm install
npm run dev          # Vite preview at http://localhost:5173 (web build only)
npm run electron:dev # the full app (file tree, workspaces, chat tools)
npm test             # vitest
```

## Contributing & Development

### Project structure

```
src/
  adapters/     LLM adapters (anthropic, openai). Implement LLMAdapter to add a provider.
  agents/       Selection-agent runner and chat (tool-calling) runner.
  components/   React UI: Canvas, FloatingToolbar, ChatPanel, FileTree, ide/, dialogs/.
  config/       Profile loader and parser. Profiles live in electron/defaults/*.yaml.
  hooks/        useSettings, useWorkspace, etc.
  lib/          Pure helpers: backup, contextMenu, fs abstractions, markdown editor setup.
  tools/        Chat tools (read/list/search/create/edit/delete/rename/mkdir/setTodos)
                with handlers and a registry. Mutating tools require approval.
electron/
  main.cjs      Electron entry, IPC, window lifecycle.
  defaults/     Bundled profiles: fiction.yaml, technical.yaml, factual.yaml.
  remote-fs.cjs SSH-backed remote filesystem (experimental).
  ssh-pool.cjs  SSH connection pool.
```

### Adding a provider

1. Create `src/adapters/myprovider.ts` implementing `LLMAdapter` from `./types`.
2. Register it in `src/adapters/index.ts`.

It will appear automatically in the settings drawer's provider dropdown.

### Adding or editing a profile

Profiles are YAML files in `electron/defaults/`. Each profile defines a list
of actions (agents). Schema is enforced by `src/config/parse.ts`. Copy
`fiction.yaml` as a starting point and edit; the file is loaded at app
startup.

### Building installers

```bash
npm run electron:build:linux
npm run electron:build:mac    # requires a Mac
npm run electron:build:win    # cross-builds via wine, or run on Windows
```

Output lands in `release/`.

### Releasing

Releases are tag-driven:

```bash
npm version patch    # or minor / major — creates commit + tag, e.g. v0.4.1
git push origin main
git push origin --tags
```

Pushing `vX.Y.Z` triggers `.github/workflows/release.yml`. Linux and macOS
jobs build in parallel and publish to a draft GitHub Release. After ~10–15
minutes, review the draft and click **Publish**.

macOS builds are currently unsigned. Code signing is planned.

### Regenerating documentation screenshots

```bash
npm run screenshots                    # all pages
npm run screenshots -- --only=the-editor  # one page
```

Requires Linux/macOS desktop and (optionally) `.env.screenshots` populated
from `.env.screenshots.example`.

## Tech

React 19 · Vite · TypeScript · Electron 33 · CodeMirror 6 (markdown) ·
Tailwind CSS v3 · marked + DOMPurify · diff ·
isomorphic-git · ssh2.

## License

MIT — see [LICENSE](./LICENSE).
