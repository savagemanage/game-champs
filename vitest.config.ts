import { defineConfig } from 'vitest/config';

// Unit tests cover the pure-logic helpers only (no Phaser / DOM needed):
// the gas meter economy and the wave-composition expansion. Feel and
// rendering remain play-test/build verified.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
