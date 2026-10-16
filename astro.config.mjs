import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  integrations: [],
  output: 'static', // Mantém o site estático e super rápido
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
  vite: {
    ssr: {
      external: ['google-ads-api']
    }
  }
});
