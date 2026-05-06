// Shared helpers for the screenshot driver.
// Goal: give scripts/screenshots.mjs a small, focused API:
//   const app = await launchApp({ workspace, theme });
//   await capture(app, 'page-slug/shot-name', selector?, opts?);
//   await app.close();

import { _electron as electron } from 'playwright-core';
import { mkdir, copyFile, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');
export const SCREENSHOTS_DIR = join(REPO_ROOT, 'docs', 'screenshots');
export const FIXTURES_DIR = join(SCREENSHOTS_DIR, 'fixtures');
export const TMP_DIR = join(SCREENSHOTS_DIR, '.tmp');

const SKIP_NAMES = new Set(['.DS_Store', '.git', 'node_modules']);

/** Recursively copy a directory. Skips OS/editor noise but preserves app dotfiles like `.canv/`. */
export async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_NAMES.has(e.name)) continue;
    const s = join(src, e.name);
    const d = join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}

/** Materialise a fixture into a fresh temp dir. Returns the absolute path. */
export async function seedFixture(fixtureName) {
  await mkdir(TMP_DIR, { recursive: true });
  const id = randomBytes(4).toString('hex');
  const dest = join(TMP_DIR, `${fixtureName}-${id}`);
  const src = join(FIXTURES_DIR, fixtureName);
  if (!existsSync(src)) {
    throw new Error(`Fixture not found: ${src}`);
  }
  await copyDir(src, dest);
  return dest;
}

/**
 * Launch the Electron app pointed at a workspace.
 * Sets CANV_SCREENSHOT_WORKSPACE so electron/main.cjs can pick it up.
 * Theme: 'light' | 'dark'.
 */
export async function launchApp({ workspace, theme = 'dark', profile } = {}) {
  const env = { ...process.env };
  if (workspace) env.CANV_SCREENSHOT_WORKSPACE = workspace;
  if (theme) env.CANV_SCREENSHOT_THEME = theme;
  if (profile) env.CANV_SCREENSHOT_PROFILE = profile;
  const app = await electron.launch({
    args: ['.'],
    cwd: REPO_ROOT,
    env,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window };
}

/**
 * Capture a screenshot to docs/screenshots/<slug>.png (slug includes the page sub-folder).
 * If selector is provided, captures that element only (with padding).
 */
export async function capture({ window }, slug, selector = null, opts = {}) {
  const out = join(SCREENSHOTS_DIR, `${slug}.png`);
  await mkdir(dirname(out), { recursive: true });
  if (selector) {
    const handle = await window.waitForSelector(selector, { timeout: 5000 });
    await handle.screenshot({ path: out, ...opts });
  } else {
    await window.screenshot({ path: out, fullPage: false, ...opts });
  }
  console.log(`captured ${slug}.png`);
}

/** Wait for the canvas editor to be mounted and idle. */
export async function waitForEditor(window) {
  await window.waitForSelector('.cm-editor', { timeout: 10000 });
}

/** Cleanup helpers — call from scripts on success and failure. */
export async function cleanupTmp() {
  if (existsSync(TMP_DIR)) await rm(TMP_DIR, { recursive: true, force: true });
}

/** Returns the profile id from `<workspace>/.canv/profile.json`, or null if absent / malformed. */
export async function readFixtureProfile(workspaceDir) {
  try {
    const raw = await readFile(join(workspaceDir, '.canv', 'profile.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}
