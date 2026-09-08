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
  build: {
    // Phaser minifies to ~1.5MB and is intentionally isolated in its own
    // lazy-loaded vendor chunk (see below), so the default 500kB advisory is a
    // false positive for it. Raise the limit just above the real engine size so
    // genuinely surprising regressions in app/vendor chunks would still warn.
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      output: {
        // Split large, rarely-changing dependencies into their own long-cacheable
        // vendor chunks. Phaser stays behind the existing dynamic import of
        // PhaserGame (React.lazy in BattleScreen), so isolating it here keeps the
        // engine out of the initial entry chunk and off the title-screen path.
        manualChunks(id: string): string | undefined {
          const has = (fragment: string): boolean => id.indexOf(fragment) !== -1;
          if (has('/node_modules/phaser/')) {
            return 'phaser';
          }
          if (
            has('/node_modules/react/') ||
            has('/node_modules/react-dom/') ||
            has('/node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          if (has('/node_modules/i18next/') || has('/node_modules/react-i18next/')) {
            return 'i18n-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    css: false,
  },
}));
