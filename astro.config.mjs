import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [],
  output: 'static', // Garante o build estático ultrarrápido
  vite: {
    ssr: {
      external: ['google-ads-api']
    }
  }
});
