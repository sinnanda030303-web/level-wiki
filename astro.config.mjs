// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  // canonical URL과 sitemap 생성에 쓰인다. 도메인을 옮기면 여기만 바꾸면 된다.
  site: 'https://level-wiki-two.vercel.app',
  integrations: [react()],
  server: { port: 4321 },
});
