#!/usr/bin/env node
// Regenerates docs/screenshots/**/*.png by driving the Electron app via Playwright.
// Usage: npm run screenshots [-- --only=the-editor]
//
// Per-page capture functions are defined below. Each function:
//   - takes the launched app helpers
//   - drives the UI into a known state
//   - calls capture(...) one or more times
//
// Add a new page by adding a function and registering it in PAGES.

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  REPO_ROOT,
  launchApp,
  capture,
  waitForEditor,
  seedFixture,
  readFixtureProfile,
  cleanupTmp,
} from './screenshots/lib.mjs';

loadEnv({ path: join(REPO_ROOT, '.env.screenshots') });

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1] : null;

async function smokeShot({ window }) {
  // Open the first visible markdown file in the sidebar so .cm-editor renders.
  // File rows contain a .lucide-file-text SVG; click the nearest ancestor div.
  const fileItem = await window.waitForSelector('.lucide-file-text', { timeout: 15000 });
  await fileItem.evaluate((el) => el.closest('div[class*="cursor-pointer"]')?.click());
  await waitForEditor(window);
  await capture({ window }, 'smoke/canvas-empty');
}

// ---------------------------------------------------------------------------
// getting-started
// ---------------------------------------------------------------------------

/**
 * Capture the profile picker. Launched with an empty workspace (no profile.json)
 * so the picker appears on first boot. An empty workspace is required so the
 * app loads from dist/index.html rather than trying to reach the dev server.
 */
async function captureGettingStartedPicker() {
  console.log('==> getting-started (profile-picker)');
  // Seed the empty fixture — no profile.json, so canv:profile is not set.
  // The empty workspace causes the app to use the dist build, and the absence
  // of a profile triggers the first-launch picker once workspace.ready fires.
  // Use a fresh temp userData dir so localStorage is always clean — no
  // profile from a previous run can bleed in.
  const freshUserData = await mkdtemp(join(tmpdir(), 'canv-picker-'));
  const workspace = await seedFixture('empty');
  const env = { ...process.env, CANV_SCREENSHOT_WORKSPACE: workspace, CANV_SCREENSHOT_THEME: 'light' };
  const { _electron: electron } = await import('playwright-core');
  const pickerApp = await electron.launch({
    args: ['.', `--user-data-dir=${freshUserData}`],
    cwd: REPO_ROOT,
    env,
  });
  const pickerWindow = await pickerApp.firstWindow();
  await pickerWindow.waitForLoadState('domcontentloaded');
  const helpers = { app: pickerApp, window: pickerWindow };
  try {
    await helpers.window.waitForSelector('[data-testid="profile-picker"]', { timeout: 10000 });
    await capture(helpers, 'getting-started/profile-picker');
  } finally {
    await helpers.app.close();
    await rm(freshUserData, { recursive: true, force: true });
  }
}

async function captureGettingStarted({ window }) {
  // Open the-novel.md so the editor renders.
  const fileItem = await window.waitForSelector('.lucide-file-text', { timeout: 15000 });
  await fileItem.evaluate((el) => el.closest('div[class*="cursor-pointer"]')?.click());
  await waitForEditor(window);

  // 1. Empty document — editor with file open.
  await capture({ window }, 'getting-started/first-document-empty');

  // 2. Settings → API key.
  // The settings gear button lives in the sidebar footer with aria-label "Open Settings".
  await window.click('button[aria-label="Open Settings"]');
  // Wait for the Settings tab heading to appear.
  await window.waitForSelector('h1:has-text("Settings")', { timeout: 5000 });
  // Scroll / wait for the API key input (type password).
  await window.waitForSelector('input[type="password"]', { timeout: 5000 });
  await capture({ window }, 'getting-started/settings-api-key');
  // Close the Settings tab by clicking the close button on the Settings tab itself.
  await window.click('button[aria-label="Close Settings"]');
  await sleep(300);
  // The editor should now be visible — click the file in the tab bar to re-focus.
  await waitForEditor(window);

  // 3. First agent run — click into editor, select all, capture floating toolbar.
  await window.click('.cm-editor');
  await sleep(200);
  await window.keyboard.press('Control+A');
  await sleep(500);
  // Wait for the floating toolbar to appear.
  await window.waitForSelector('[data-testid="floating-toolbar"]', { timeout: 5000 });
  await capture({ window }, 'getting-started/first-agent-run');

  // 4. Apply result — only if an API key is present in the environment.
  if (process.env.ANTHROPIC_API_KEY) {
    // Click the Grammar & Spelling button (title="Grammar & Spelling") in the toolbar.
    await window.click('[data-testid="floating-toolbar"] button[title="Grammar & Spelling"]');
    // Wait for the run result panel — the Apply button appears once the run completes.
    await window.waitForSelector('button:has-text("Apply")', { timeout: 60000 });
    await capture({ window }, 'getting-started/apply-result');
  }
}

// ---------------------------------------------------------------------------
// the-editor
// ---------------------------------------------------------------------------

async function captureTheEditor({ window }) {
  // Open the-novel.md so the editor renders.
  await window.click('text=the-novel.md', { timeout: 5000 });
  await waitForEditor(window);

  // 1. Hero canvas — full editor with the open novel.
  await capture({ window }, 'the-editor/hero-canvas');

  // 2. Floating toolbar — select the first line so the toolbar appears.
  await window.click('.cm-editor');
  await sleep(200);
  await window.keyboard.press('Control+Home');
  await sleep(100);
  await window.keyboard.press('Shift+End');
  await sleep(500);
  await window.waitForSelector('[data-testid="floating-toolbar"]', { timeout: 5000 });
  await capture({ window }, 'the-editor/floating-toolbar');

  // 3. Document agent menu — click the trigger.
  // Dismiss floating toolbar first by pressing Escape, then click elsewhere.
  await window.keyboard.press('Escape');
  await sleep(200);
  // Click somewhere neutral in the editor to drop the selection.
  await window.click('.cm-editor');
  await sleep(200);
  await window.keyboard.press('Escape');
  await sleep(200);
  await window.click('[data-testid="document-agent-menu-trigger"]');
  await window.waitForSelector('[data-testid="document-agent-menu"]', { timeout: 3000 });
  await capture({ window }, 'the-editor/document-agent-menu');
  await window.keyboard.press('Escape');
  await sleep(200);

  // 4. Preview mode — click the Preview button.
  await window.click('[data-testid="preview-toggle"]');
  await sleep(500);
  await capture({ window }, 'the-editor/preview-mode');
  // Return to edit mode.
  await window.click('button[aria-pressed="false"]:has-text("Edit")');
  await sleep(200);

  // 5. Typography controls — open settings and scroll to the Editor section.
  await window.click('button[aria-label="Open Settings"]');
  await window.waitForSelector('h1:has-text("Settings")', { timeout: 5000 });
  await window.waitForSelector('[data-testid="typography-controls"]', { timeout: 5000 });
  // Scroll the typography controls into view.
  await window.evaluate(() => {
    document.querySelector('[data-testid="typography-controls"]')?.scrollIntoView({ block: 'center' });
  });
  await sleep(300);
  await capture({ window }, 'the-editor/typography-controls');
  await window.click('button[aria-label="Close Settings"]');
  await sleep(200);
}

async function captureTheEditorLight() {
  console.log('==> the-editor (light)');
  const workspace = await seedFixture('canonical');
  const profile = await readFixtureProfile(workspace);
  const helpers = await launchApp({ workspace, theme: 'light', profile });
  try {
    await helpers.window.click('text=the-novel.md', { timeout: 5000 });
    await waitForEditor(helpers.window);
    await capture(helpers, 'the-editor/theme-light');
  } finally {
    await helpers.app.close();
  }
}

// ---------------------------------------------------------------------------
// profiles-and-agents
// ---------------------------------------------------------------------------

async function captureProfilesAndAgents({ window }) {
  // Open the-novel.md so the editor renders.
  await window.click('text=the-novel.md', { timeout: 5000 });
  await waitForEditor(window);

  // 1. profile-switcher — click the status-bar profile button to open the
  //    picker modal in 'new' (mid-session) mode, then capture.
  await window.click('[data-testid="profile-switcher"]');
  await window.waitForSelector('[data-testid="profile-picker"]', { timeout: 5000 });
  await capture({ window }, 'profiles-and-agents/profile-switcher');
  // Dismiss by clicking the Cancel button (mode='new' shows a Cancel button).
  await window.click('[data-testid="profile-picker"] button:has-text("Cancel")');
  await sleep(300);

  // 2. agent-list-fiction — select all text to surface the floating toolbar,
  //    then open the presets popover so all agents are visible.
  await window.click('.cm-editor');
  await sleep(200);
  await window.keyboard.press('Control+A');
  await sleep(500);
  await window.waitForSelector('[data-testid="floating-toolbar"]', { timeout: 5000 });
  // Click the Zap (quick presets) button to show all preset agents.
  await window.click('[data-testid="floating-toolbar"] button[title="Quick presets"]');
  await sleep(300);
  await capture({ window }, 'profiles-and-agents/agent-list-fiction');
  // Dismiss the presets popover.
  await window.keyboard.press('Escape');
  await sleep(200);

  // 3. custom-instruction-modal — click the Refine agent button (needsInstruction=true).
  //    The toolbar transitions to an inline instruction input.
  await window.click('.cm-editor');
  await sleep(200);
  await window.keyboard.press('Control+A');
  await sleep(500);
  await window.waitForSelector('[data-testid="floating-toolbar"]', { timeout: 5000 });
  await window.click('[data-testid="floating-toolbar"] button[title="Refine"]');
  await sleep(300);
  await capture({ window }, 'profiles-and-agents/custom-instruction-modal');
  // Dismiss by pressing Escape.
  await window.keyboard.press('Escape');
  await sleep(300);

  // 4. per-agent-model — open Settings, navigate to Per-action model overrides,
  //    uncheck "use default for all", expand Fiction, then capture.
  await window.click('button[aria-label="Open Settings"]');
  await window.waitForSelector('h1:has-text("Settings")', { timeout: 5000 });
  await window.waitForSelector('[data-testid="per-agent-model"]', { timeout: 5000 });
  // Scroll per-agent-model section into view.
  await window.evaluate(() => {
    document.querySelector('[data-testid="per-agent-model"]')?.scrollIntoView({ block: 'center' });
  });
  await sleep(200);
  // Uncheck "Use default model for all actions" so the per-agent controls appear.
  const useDefaultCheckbox = await window.waitForSelector(
    '[data-testid="per-agent-model"] input[type="checkbox"]',
    { timeout: 3000 }
  );
  const isChecked = await useDefaultCheckbox.isChecked();
  if (isChecked) {
    await useDefaultCheckbox.click();
    await sleep(300);
  }
  // Expand the Fiction mode section.
  await window.click('[data-testid="per-agent-model"] button:has-text("Fiction")', { timeout: 3000 });
  await sleep(400);
  // Scroll it back into view after expansion.
  await window.evaluate(() => {
    document.querySelector('[data-testid="per-agent-model"]')?.scrollIntoView({ block: 'start' });
  });
  await sleep(200);
  await capture({ window }, 'profiles-and-agents/per-agent-model');
  await window.click('button[aria-label="Close Settings"]');
  await sleep(200);
}

// ---------------------------------------------------------------------------
// results-and-applying
// ---------------------------------------------------------------------------

/**
 * Stale-run fixture: a completed "Grammar & Spelling" run whose schemaVersion
 * is absent (legacy), so Apply is disabled and shows the stale-selection tooltip.
 * The response uses the ISSUES/CORRECTED format that parseAgentResponse expects.
 */
const STALE_RUN_FIXTURE = JSON.stringify([
  {
    id: 'screenshot-stale-run-1',
    agentId: 'grammar',
    agentLabel: 'Grammar & Spelling',
    modeId: 'fiction',
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    sourceText: 'She walked into the room, and her eyes was immediately drawn to the old portrait on the wall.',
    range: { from: 0, to: 92 },
    response:
      'ISSUES:\n- "was" should be "were" (subject–verb agreement: "eyes … were")\n\nCORRECTED:\nShe walked into the room, and her eyes were immediately drawn to the old portrait on the wall.',
    status: 'done',
    timestamp: Date.now() - 120000,
    basePrompt: 'grammar-placeholder',
    // schemaVersion intentionally absent — triggers "stale" disabled-Apply state
  },
]);

async function captureResultsAndApplyingStale() {
  console.log('==> results-and-applying (stale-selection-tooltip)');
  const workspace = await seedFixture('canonical');
  const profile = await readFixtureProfile(workspace);
  const { _electron: electron } = await import('playwright-core');
  const app = await electron.launch({
    args: ['.'],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      CANV_SCREENSHOT_WORKSPACE: workspace,
      CANV_SCREENSHOT_THEME: 'light',
      CANV_SCREENSHOT_PROFILE: profile ?? '',
      CANV_SCREENSHOT_SEED_RUNS: STALE_RUN_FIXTURE,
    },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  try {
    // Open the-novel.md so the editor renders — this also surfaces the runs panel.
    const fileItem = await window.waitForSelector('.lucide-file-text', { timeout: 15000 });
    await fileItem.evaluate((el) => el.closest('div[class*="cursor-pointer"]')?.click());
    await waitForEditor(window);

    // The seeded run should cause the results panel to render automatically.
    // Wait for the Apply button (disabled).
    const applyBtn = await window.waitForSelector('button:has-text("Apply")', { timeout: 8000 });

    // Verify the button is disabled (it should be, since schemaVersion is absent).
    const isDisabled = await applyBtn.isDisabled();
    if (!isDisabled) {
      console.warn('  WARNING: Apply button is not disabled — stale-run seeding may not have worked.');
    }

    // Hover the button to trigger the tooltip (title attribute).
    await applyBtn.hover();
    await sleep(600);

    // Capture the full window so the tooltip is visible in context.
    await capture({ window }, 'results-and-applying/stale-selection-tooltip');
  } finally {
    await app.close();
  }
}

async function captureResultsAndApplying({ window }) {
  // All shots in this function require a live API key (streaming, diff-view,
  // apply-button, run-history-tabs). They are deferred to MANUAL.md when the
  // key is absent.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  Skipping API-dependent shots (no ANTHROPIC_API_KEY).');
    return;
  }

  // Open the-novel.md.
  await window.click('text=the-novel.md', { timeout: 5000 });
  await waitForEditor(window);

  // Select the first paragraph and run Grammar & Spelling.
  await window.click('.cm-editor');
  await sleep(200);
  await window.keyboard.press('Control+Home');
  await sleep(100);
  // Select to end of paragraph (a few lines).
  for (let i = 0; i < 3; i++) {
    await window.keyboard.press('Shift+ArrowDown');
  }
  await window.keyboard.press('Shift+End');
  await sleep(400);
  await window.waitForSelector('[data-testid="floating-toolbar"]', { timeout: 5000 });

  // Click Grammar & Spelling to start a run.
  await window.click('[data-testid="floating-toolbar"] button[title="Grammar & Spelling"]');

  // Wait a moment then capture mid-stream (status pill shows "Streaming").
  await window.waitForSelector('.bg-blue-100:has-text("Streaming")', { timeout: 15000 });
  await sleep(800);
  await capture({ window }, 'results-and-applying/streaming');

  // Wait for the run to complete.
  await window.waitForSelector('button:has-text("Apply")', { timeout: 60000 });
  await sleep(400);

  // Expand the diff view.
  const diffSummary = await window.waitForSelector('details summary:has-text("Show diff")', { timeout: 5000 });
  await diffSummary.click();
  await sleep(300);
  await capture({ window }, 'results-and-applying/diff-view');

  // Focus on the Apply button area.
  const applyBtn = await window.waitForSelector('button:has-text("Apply")', { timeout: 3000 });
  await applyBtn.scrollIntoViewIfNeeded();
  await sleep(200);
  await capture({ window }, 'results-and-applying/apply-button');

  // Run a second agent so a second tab appears in the history bar.
  // We only need the tab to render — no need to wait for the run to complete.
  await window.click('.cm-editor');
  await sleep(200);
  await window.keyboard.press('Control+Home');
  await sleep(100);
  for (let i = 0; i < 3; i++) {
    await window.keyboard.press('Shift+ArrowDown');
  }
  await window.keyboard.press('Shift+End');
  await sleep(400);
  await window.waitForSelector('[data-testid="floating-toolbar"]', { timeout: 5000 });

  // Click a different core agent (Story Reviewer is reliably present in Fiction).
  await window.click('[data-testid="floating-toolbar"] button[title="Story Reviewer"]');

  // Tabs appear in the history bar as soon as the run starts. Wait for the
  // streaming pill, then capture — the second run continues in the background.
  await window.waitForSelector('.bg-blue-100:has-text("Streaming")', { timeout: 15000 });
  await sleep(600);
  await capture({ window }, 'results-and-applying/run-history-tabs');
}

// ---------------------------------------------------------------------------
// chat-and-tools
// ---------------------------------------------------------------------------

/**
 * Capture the empty chat panel (no API key required).
 *
 * API-dependent shots (chat-with-message, tool-chip, approval-card-pending,
 * approval-card-approved, todo-card, tool-budget-reached) are deferred to
 * docs/screenshots/MANUAL.md. Seeding those states via localStorage is not
 * viable: the approval card is driven by a React Map in live turn state, not
 * by persisted data, so a simple localStorage seed would not reconstruct the
 * interactive approval flow.
 */
async function captureChatAndTools({ window }) {
  // Open the-novel.md so the editor and bottom panel render.
  await window.click('text=the-novel.md', { timeout: 5000 });
  await waitForEditor(window);

  // Open the bottom panel to the Chat tab via the sidebar footer toggle button.
  // The button has aria-label "Open chat" when the panel is closed.
  await window.click('button[aria-label="Open chat"]');
  await sleep(500);

  // Wait for the Chat tab to be rendered — look for the textarea input.
  await window.waitForSelector('textarea[placeholder="Message the document…"]', { timeout: 8000 });

  // 1. Empty chat panel.
  await capture({ window }, 'chat-and-tools/chat-empty');

  // Remaining shots require a live API key — they are deferred to MANUAL.md.
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('  API key present — live chat shots not yet automated; deferred to MANUAL.md.');
  } else {
    console.log('  No ANTHROPIC_API_KEY — API-dependent chat shots deferred to MANUAL.md.');
  }
}

// ---------------------------------------------------------------------------
// workspaces-and-files
// ---------------------------------------------------------------------------

async function captureWorkspacesAndFiles({ window }) {
  // 1. file-tree.png — sidebar with the file tree visible.
  // Wait for at least one file row to be present.
  await window.waitForSelector('.lucide-file-text', { timeout: 15000 });
  await capture({ window }, 'workspaces-and-files/file-tree');

  // 2. Open the-novel.md so we have something focused in the tree.
  await window.click('text=the-novel.md', { timeout: 5000 });
  await waitForEditor(window);

  // 3. file-tree-context-menu.png — right-click on notes/scrap.md to show menu.
  //    First expand the notes folder by clicking it.
  await window.click('text=notes', { timeout: 5000 });
  await sleep(300);
  // Right-click on scrap.md to trigger context menu.
  const scrapItem = await window.waitForSelector('text=scrap.md', { timeout: 5000 });
  await scrapItem.evaluate((el) => {
    const row = el.closest('div[class*="cursor-pointer"]');
    if (row) {
      const rect = row.getBoundingClientRect();
      const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 4 });
      row.dispatchEvent(evt);
    }
  });
  await sleep(400);
  // Wait for the context menu to appear (it contains "New file…").
  await window.waitForSelector('button:has-text("New file…")', { timeout: 5000 });
  await capture({ window }, 'workspaces-and-files/file-tree-context-menu');

  // Dismiss the context menu.
  await window.keyboard.press('Escape');
  await sleep(300);

  // 4. editor-tabs.png — open a second file so two tabs are visible.
  //    Expand the research folder then click character-bible.md.
  await window.click('text=research', { timeout: 5000 });
  await sleep(300);
  const characterBibleRow = await window.waitForSelector('text=character-bible.md', { timeout: 5000 });
  await characterBibleRow.evaluate((el) => el.closest('div[class*="cursor-pointer"]')?.click());
  // Editor is already mounted from the-novel.md; just wait for the tab to appear.
  await window.waitForSelector('text=character-bible.md', { timeout: 5000 });
  await sleep(600);
  await capture({ window }, 'workspaces-and-files/editor-tabs');

  // 5. command-palette.png — open the file palette with Ctrl+P.
  await window.keyboard.press('Control+P');
  await window.waitForSelector('input[placeholder="Open a file by name…"]', { timeout: 5000 });
  await capture({ window }, 'workspaces-and-files/command-palette');

  // Dismiss the palette.
  await window.keyboard.press('Escape');
  await sleep(300);

  // 6. pinned-file.png — pin notes/scrap.md via right-click → "Pin to context".
  //    The notes folder should already be expanded from step 3.
  const scrapVisible = await window.waitForSelector('text=scrap.md', { timeout: 5000 });
  await scrapVisible.evaluate((el) => {
    const row = el.closest('div[class*="cursor-pointer"]');
    if (row) {
      const rect = row.getBoundingClientRect();
      const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 4 });
      row.dispatchEvent(evt);
    }
  });
  await sleep(400);
  await window.waitForSelector('button:has-text("Pin to context")', { timeout: 5000 });
  await window.click('button:has-text("Pin to context")');
  await sleep(400);
  // The Pin icon should now appear in the sidebar next to scrap.md.
  await window.waitForSelector('[aria-label*="pinned to context"]', { timeout: 5000 });
  await capture({ window }, 'workspaces-and-files/pinned-file');

  // workspace-on-disk.png is deferred (Finder/Explorer screenshot) — see MANUAL.md.
}

// ---------------------------------------------------------------------------
// settings-and-data
// ---------------------------------------------------------------------------

async function captureSettingsAndData({ window }) {
  // Open the-novel.md so the editor renders.
  await window.click('text=the-novel.md', { timeout: 5000 });
  await waitForEditor(window);

  // 1. Open Settings tab — click the gear button in the sidebar footer.
  await window.click('button[aria-label="Open Settings"]');
  await window.waitForSelector('h1:has-text("Settings")', { timeout: 5000 });
  await sleep(300);

  // 2. settings-tab.png — overview of the full settings panel.
  await capture({ window }, 'settings-and-data/settings-tab');

  // 3. backup-export.png — capture the Backup & Restore section element directly.
  //    Scrolls into view automatically via the selector-based capture path.
  await window.waitForSelector('[data-testid="settings-section-backup"]', { timeout: 5000 })
  await capture({ window }, 'settings-and-data/backup-export', '[data-testid="settings-section-backup"]')

  // 4. lint-rules.png — capture the Problems section element directly.
  await window.waitForSelector('[data-testid="settings-section-problems"]', { timeout: 5000 })
  await capture({ window }, 'settings-and-data/lint-rules', '[data-testid="settings-section-problems"]')

  // Close Settings.
  await window.click('button[aria-label="Close Settings"]');
  await sleep(200);
}

/**
 * Capture the MigrationModal by seeding legacy v1 localStorage keys.
 * Requires a fresh userData dir (no canv:schemaVersion='2') and a workspace
 * to satisfy the "screenshot mode loads dist" guard in main.cjs.
 */
async function captureSettingsAndDataMigration() {
  console.log('==> settings-and-data (migration-modal)');
  const workspace = await seedFixture('canonical');
  const freshUserData = await mkdtemp(join(tmpdir(), 'canv-legacy-'));
  const { _electron: electron } = await import('playwright-core');
  const migrationApp = await electron.launch({
    args: ['.', `--user-data-dir=${freshUserData}`],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      CANV_SCREENSHOT_WORKSPACE: workspace,
      CANV_SCREENSHOT_THEME: 'light',
      CANV_SCREENSHOT_SEED_LEGACY: '1',
    },
  });
  const migrationWindow = await migrationApp.firstWindow();
  await migrationWindow.waitForLoadState('domcontentloaded');
  try {
    // MigrationModal should appear because legacy keys are present and
    // canv:schemaVersion is not '2'. Wait for the modal heading.
    await migrationWindow.waitForSelector('h2:has-text("Welcome to Canv 0.2")', { timeout: 10000 });
    await sleep(300);
    await capture({ window: migrationWindow }, 'settings-and-data/migration-modal');
  } finally {
    await migrationApp.close();
    await rm(freshUserData, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Troubleshooting page captures
// ---------------------------------------------------------------------------

/**
 * captureTroubleshooting
 *
 * api-error-banner.png — deferred to MANUAL.md.
 *
 * Triggering the error requires a live HTTPS round-trip to api.anthropic.com
 * that returns a 401. The Playwright Electron driver running in a sandboxed /
 * headless environment does not have real API access, so the capture cannot be
 * automated reliably here.
 *
 * Gatekeeper / SmartScreen screenshots are OS-native dialogs that appear
 * before the app launches and therefore cannot be captured by the Electron
 * Playwright driver at all. Both are deferred to MANUAL.md.
 *
 * To enable this capture once real API access is available in CI:
 *   1. Set ANTHROPIC_API_KEY to a well-formed but invalid key (e.g.
 *      `sk-ant-invalid-key-for-screenshot`).
 *   2. Open the canonical fixture, select text, run Grammar.
 *   3. Wait for `[data-status="error"]` on the results panel, then call
 *      capture(helpers, 'troubleshooting/api-error-banner').
 *   4. Uncomment `'troubleshooting': captureTroubleshooting` in PAGES.
 */
async function captureTroubleshooting(_helpers) {
  // All shots deferred — see docs/screenshots/MANUAL.md.
  console.log('  (troubleshooting) all shots deferred to MANUAL.md — skipping');
}

// ---------------------------------------------------------------------------
// Page registry
// ---------------------------------------------------------------------------

const PAGES = {
  smoke: smokeShot,
  'getting-started': captureGettingStarted,
  'the-editor': captureTheEditor,
  'profiles-and-agents': captureProfilesAndAgents,
  'results-and-applying': captureResultsAndApplying,
  'chat-and-tools': captureChatAndTools,
  'workspaces-and-files': captureWorkspacesAndFiles,
  'settings-and-data': captureSettingsAndData,
  // 'troubleshooting': captureTroubleshooting,
};

async function runPage(name) {
  console.log(`==> ${name}`);
  const workspace = await seedFixture('canonical');
  const profile = await readFixtureProfile(workspace);
  const helpers = await launchApp({ workspace, profile });
  try {
    await PAGES[name](helpers);
  } finally {
    await helpers.app.close();
  }
}

async function main() {
  const names = only ? [only] : Object.keys(PAGES);

  // 'getting-started' needs two separate launch paths: the picker (no
  // workspace/profile) followed by the main captures (seeded workspace).
  if (names.includes('getting-started')) {
    await captureGettingStartedPicker();
  }

  for (const name of names) {
    if (!PAGES[name]) {
      console.error(`Unknown page: ${name}`);
      process.exit(1);
    }
    await runPage(name);
    // 'the-editor' needs a second light-theme launch for the comparison shot.
    if (name === 'the-editor') {
      await captureTheEditorLight();
    }
    // 'results-and-applying' needs a separate seeded launch for the stale-selection shot.
    if (name === 'results-and-applying') {
      await captureResultsAndApplyingStale();
    }
    // 'settings-and-data' needs a separate legacy-seeded launch for migration-modal.png.
    if (name === 'settings-and-data') {
      await captureSettingsAndDataMigration();
    }
  }
  await cleanupTmp();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
