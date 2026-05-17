# Canv 0.7.1

## Downloads

| File | Platform  |
|---|---|
| `Canv-0.7.1-arm64.dmg` | macOS (Apple Silicon) |
| `Canv-0.7.1.dmg` | macOS (Intel) |
| `Canv-Setup-0.7.1.exe` | Windows (NSIS installer) |
| `Canv-0.7.1.exe` | Windows (portable) |
| `Canv-0.7.1.AppImage` | Linux (x86_64) |
| `canv_0.7.1_amd64.deb` | Linux Debian / Ubuntu (amd64) |
| `canv-0.7.1.x86_64.rpm` | Linux Fedora / RHEL / openSUSE (x86_64) |

macOS builds are unsigned. On first launch right-click the app and choose **Open** to bypass Gatekeeper.

## Features

- **Revision Archaeology — a full workspace History system.** A new git-backed history store (`canv-history`) sits alongside your workspace and captures snapshots without polluting your own repo:
  - **Workspace setup modal** on first use, with a per-workspace config.
  - **Bracketed AI turns** — automatic before/after snapshots around each agent run, plus an **idle autosnapshot** hook that captures quiet moments.
  - **History tab** replaces the old Git tab (gated on Revision Archaeology), with snapshot list, reason badges, and computed deltas.
  - **Expanded snapshots** show the computed delta vs the working tree, with human-readable base labels in the diff tab (not SHAs).
  - **File History panel** — per-file revision walk in the bottom panel, openable from the Files tab's right-click "View history", with pop-out support.
  - **Restore preview dialog** — diff a file or whole snapshot against current, then restore with an automatic `before_rollback` safety snapshot.
  - **Smart timestamps** across the History sidebar and file-history panel — relative dates ("today 14:32", "yesterday", "Mon") with full timestamps on hover.
- **Ollama provider — local, zero-cost LLMs.** Full first-class adapter alongside the cloud providers:
  - Non-streaming and NDJSON streaming via `/api/chat`, with mid-stream abort returning partial text.
  - `/api/tags` model discovery, a **Refresh models** button in Settings, auto-refresh on startup, and a status line.
  - Native tool-call extraction on any NDJSON line, configurable **base URL** plumbed through Settings → runner → adapter.
  - `num_ctx` raised to 32 768 so chapter-length context and tool definitions both survive the prompt.
  - Per-action and pricing tables read from the refreshed model list — no more stale seed models.
- **Configured-provider filtering everywhere.** The sidebar workspace picker, chat picker, per-action picker, and Settings pricing tables now only list providers you have credentials for. Unconfigured providers no longer leak into pickers as ghost options.
- **Landing site at `/site`.** A new Astro + Starlight site shipped in-repo:
  - Hero, three-up feature grid (local-first, pluggable AI, profile-driven), four capability cards, per-platform download cards, privacy block, footer with live version from `package.json`.
  - Custom H1-aware loader wires Starlight to the existing `docs/` tree with clean edit URLs and inter-page link rewriting.
  - GitHub Actions workflow auto-deploys the site to GitHub Pages after a successful Release.
  - Sticky top bar, Canv palette theme override, self-hosted Inter, favicon, real landing-page screenshots and capture script.
- **Windows builds.** Release workflow now builds and publishes a Windows NSIS installer and a portable `.exe` for every release tag.
- **Factory reset IPC handler** to wipe Electron `userData` on demand.
- **Settings reshuffle.** A new credentials-only Settings section; the sidebar footer owns the default provider / model picker; Chat tool budget moved into the Generation section.

## Fixes

- **macOS auto-stop and Windows afterPack** in the Release workflow — unblocks 0.7.x packaging.
- **Boot ordering** — profile picker and workspace-setup modal are now gated on a workspace actually being open.
- **Middle-click tab close** is deferred to `onAuxClick`, so it no longer triggers a paste of the X clipboard.
- **Electron 42 build** — stub `cpu-features` to unblock the rebuild; History tab now uses a clock glyph instead of the git-branch icon.
- **History polish** — suppress conflict popup on restore, hide diff/restore on added rows, cancel stale `FileHistory` fetches, suppress stale `setState`, include `workspace_init` in `getFileHistory`, align `getSnapshotDelta` polarity with `getCurrentChanges`, restore-mutex + schema validation hardening from code review.
- **CSP** — allow `http:` in `connect-src` so Ollama base URLs reach the renderer.
- **Lint** — satisfy `react-hooks/exhaustive-deps` and the set-state-in-effect rule across new history and picker code.
- **Site** — accurate copy for the inline-diff capability card; render markdown bodies in the custom docs loader; rewrite inter-page `.md` links to clean URLs; move the screenshot capture brief out of `public/` so it isn't served; clean edit URLs via loader-injected `editUrl`.

## Chores

- **Dependency majors:** Tailwind 4 (via the official upgrade tool), Electron 42, electron-builder 26, chokidar 5, Zod 4 (with symbol path-segment handling), Vitest 4, jsdom 29, `@types/jsdom` 28, `wait-on` 9, `@types/node` 25; dropped `@types/diff` and `@types/dompurify` (both self-typed now).
- **Docs** — refreshed user guide pages.
- **Tests** — end-to-end history flow, Ollama streaming tool calls + mid-stream abort + non-streaming tool-call parsing, chat short-circuit on per-active key gap, adapter fixtures widened for Ollama.
- **Refactors** — drop `shortTime` (superseded by `smartTime`); match sibling adapters' `wireError` style; use `git.readBlob` filepath in `readBlobOidAt`.
