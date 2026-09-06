import { defineConfig } from 'vitest/config';

// The shared package is deliberately pure helpers (responsive scaling, DPR
// clamping, touch mapping, locale scaffold), so the node environment with no
// DOM is sufficient - matching the four Vite games' unit-test setup. Consumers
// wire these numbers/data into Phaser/DOM themselves and cover that with their
// own build + play-test verification.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
