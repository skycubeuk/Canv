import type { Loader, LoaderContext } from 'astro/loaders';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';

// Walks ../docs/**/*.md, extracts the first H1 into a synthetic `title`
// frontmatter field, and emits collection entries Starlight can consume.
// The regenerate-user-docs skill writes plain markdown with no frontmatter;
// this loader bridges that gap without requiring the skill to change.
export function canvDocsLoader(): Loader {
  return {
    name: 'canv-docs-loader',
    load: async (ctx: LoaderContext) => {
      const { store, parseData, generateDigest, logger, watcher, config } = ctx;
      const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');
      const docsDir = path.join(repoRoot, 'docs');
      // Astro requires filePath to be relative to the site root (config.root).
      const siteRoot = fileURLToPath(config.root);

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

        const data = await parseData({ id, data: { title } });

        // filePath must be relative to site root (not absolute)
        const relFilePath = path.relative(siteRoot, absPath).replace(/\\/g, '/');

        store.set({
          id,
          data,
          body,
          filePath: relFilePath,
          digest: generateDigest(body),
        });

        logger.info(`Loaded ${relFromDocs} as ${id} (title: "${title}")`);
      }

      // Hot-reload when docs change in dev
      if (watcher) {
        watcher.add(path.join(docsDir, '**/*.md'));
      }
    },
  };
}

function extractTitle(raw: string, absPath: string): { title: string; body: string } {
  const lines = raw.split('\n');
  const h1Index = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (h1Index === -1) {
    throw new Error(`No H1 found in ${absPath}; cannot derive title.`);
  }
  const title = lines[h1Index].replace(/^#\s+/, '').trim();
  // Remove the H1 line and an optional blank line immediately after.
  const before = lines.slice(0, h1Index);
  let after = lines.slice(h1Index + 1);
  if (after[0] === '') after = after.slice(1);
  const body = [...before, ...after].join('\n');
  return { title, body };
}
