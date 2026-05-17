import type { Loader, LoaderContext } from 'astro/loaders';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';

const EDIT_URL_BASE = 'https://github.com/skycubeuk/Canv/edit/main/docs/';

// Walks ../docs/**/*.md, extracts the first H1 into a synthetic `title`
// frontmatter field, and emits collection entries Starlight can consume.
// The regenerate-user-docs skill writes plain markdown with no frontmatter;
// this loader bridges that gap without requiring the skill to change.
// Rebuilds the store from scratch on every load — fine for the small docs tree.
export function canvDocsLoader(): Loader {
  return {
    name: 'canv-docs-loader',
    load: async (ctx: LoaderContext) => {
      const { store, parseData, renderMarkdown, logger, config } = ctx;
      const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');
      const docsDir = path.join(repoRoot, 'docs');
      const siteRoot = fileURLToPath(config.root);
      const baseDocsUrl = `${config.base}docs/`;

      const files = await fg('**/*.md', {
        cwd: docsDir,
        absolute: true,
        ignore: ['superpowers/**'],
      });

      store.clear();

      for (const absPath of files) {
        const raw = await fs.readFile(absPath, 'utf-8');
        const { title, body } = extractTitle(raw, absPath);

        const relFromDocs = path.relative(docsDir, absPath).replace(/\\/g, '/');
        // README.md → id 'docs' (renders at /docs/)
        // foo.md → id 'docs/foo' (renders at /docs/foo/)
        // sub/bar.md → id 'docs/sub/bar' (renders at /docs/sub/bar/)
        const noExt = relFromDocs.replace(/\.md$/, '');
        const id = noExt === 'README'
          ? 'docs'
          : `docs/${noExt.replace(/\/README$/, '')}`;

        const editUrl = `${EDIT_URL_BASE}${relFromDocs}`;
        const data = await parseData({ id, data: { title, editUrl } });

        // filePath must be relative to site root (not absolute).
        const relFilePath = path.relative(siteRoot, absPath).replace(/\\/g, '/');

        const rendered = await renderMarkdown(rewriteLinks(body, baseDocsUrl));
        store.set({ id, data, body, rendered, filePath: relFilePath });

        logger.info(`Loaded ${relFromDocs} as ${id} (title: "${title}")`);
      }
    },
  };
}

function rewriteLinks(md: string, baseDocsUrl: string): string {
  const REPO_README_URL = 'https://github.com/skycubeuk/Canv/blob/main/README.md';
  // Match markdown link syntax: ](url) and ](url "title")
  return md.replace(/\]\(([^)\s]+?)(\s+"[^"]*")?\)/g, (_match, url: string, title = '') => {
    if (url === '../README.md') {
      return `](${REPO_README_URL}${title})`;
    }
    if (url === 'README.md' || url === './README.md') {
      return `](${baseDocsUrl}${title})`;
    }
    // Bare-filename .md (no slashes, no .., optional ./) → /<base>docs/<slug>/
    const bare = url.match(/^\.?\/?([\w-]+)\.md$/);
    if (bare) {
      return `](${baseDocsUrl}${bare[1]}/${title})`;
    }
    return `](${url}${title})`;
  });
}

function extractTitle(raw: string, absPath: string): { title: string; body: string } {
  const lines = raw.split('\n');
  const h1Index = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (h1Index === -1) {
    throw new Error(`No H1 found in ${absPath}; cannot derive title.`);
  }
  const title = lines[h1Index].replace(/^#\s+/, '').trim();
  const before = lines.slice(0, h1Index);
  let after = lines.slice(h1Index + 1);
  if (after[0] === '') after = after.slice(1);
  const body = [...before, ...after].join('\n');
  return { title, body };
}
