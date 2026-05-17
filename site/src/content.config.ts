import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { canvDocsLoader } from './loaders/docs-loader';

export const collections = {
  docs: defineCollection({
    loader: canvDocsLoader(),
    schema: docsSchema(),
  }),
};
