/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Every game in this monorepo is served from its own subpath of the shared
// Pages site (https://savagemanage.github.io/open-games/champs/), so a
// production build must resolve assets under '/open-games/champs/'.
// During local dev we use '/' so the Vite dev server serves from the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/open-games/champs/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    css: false,
  },
}));
