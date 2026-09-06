import { defineConfig } from 'vite';

// GitHub project pages are served from https://savagemanage.github.io/game-whiteout/
// so production assets must resolve under the '/game-whiteout/' base path.
// During local dev we use '/' so the Vite dev server serves from the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/game-whiteout/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // Phaser is a single ~1.5MB engine that can't be meaningfully code-split;
    // we isolate it in its own long-lived vendor chunk (so the game code caches
    // separately) and raise the warning limit past its size on purpose, since
    // shipping the whole engine in one cacheable chunk is expected here.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    host: true,
  },
}));
