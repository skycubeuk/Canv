import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://skycubeuk.github.io',
  base: '/Canv/',
  integrations: [
    starlight({
      title: 'Canv',
      description: 'A local-first writing canvas with AI you control.',
      social: {
        github: 'https://github.com/skycubeuk/Canv',
      },
      sidebar: [
        {
          label: 'User guide',
          autogenerate: { directory: 'docs' },
        },
      ],
    }),
  ],
});
