import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    // Linked @aztec-labs packages resolve outside node_modules, so vitest would inline them and
    // bind their `buffer` import to the npm polyfill while externalized deps use Node's Buffer.
    preserveSymlinks: true,
  },
});
