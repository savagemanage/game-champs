/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from a per-game subpath under the single game-champs Pages site in
// production; local dev serves from the root.
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
