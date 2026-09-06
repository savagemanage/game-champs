import { defineConfig } from 'vitest/config';

// Unit tests cover the pure-logic helpers only (no Phaser / DOM needed):
// the resource economy, upgrade-cost formulas, training-queue timing, combat
// resolution, and save serialization. Feel and rendering remain play-test /
// build verified.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
