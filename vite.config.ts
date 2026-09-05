import { defineConfig } from 'vite';

// GitHub project pages are served from https://savagemanage.github.io/wirework/
// so production assets must resolve under the '/wirework/' base path.
// During local dev we use '/' so the Vite dev server serves from the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/wirework/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    host: true,
  },
}));
