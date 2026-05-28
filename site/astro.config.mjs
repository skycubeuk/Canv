import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://skycubeuk.github.io',
  base: '/Canv/',
  integrations: [
    starlight({
      title: 'Canv',
      description: 'A local-first writing canvas with AI you control.',
      customCss: ['./src/styles/theme.css'],
      social: {
        github: 'https://github.com/skycubeuk/Canv',
      },
      sidebar: [
        {
          label: 'User guide',
          items: [
            { slug: 'docs' },
            { slug: 'docs/getting-started' },
            { slug: 'docs/writing-and-editing-text' },
            { slug: 'docs/listening-to-your-writing' },
            { slug: 'docs/finding-and-organising-your-work' },
            { slug: 'docs/connecting-an-ai-provider' },
            { slug: 'docs/getting-the-ai-to-help' },
            { slug: 'docs/working-with-an-ai-assistant' },
            { slug: 'docs/reviewing-and-applying-suggestions' },
            { slug: 'docs/tracking-changes-and-keeping-things-tidy' },
            { slug: 'docs/building-visual-views-of-your-project' },
            { slug: 'docs/adding-features-to-canv' },
            { slug: 'docs/troubleshooting' },
          ],
        },
      ],
    }),
  ],
});
