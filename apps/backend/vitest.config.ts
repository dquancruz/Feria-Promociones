import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // These are integration tests sharing one real Postgres instance (truncated between
    // tests) — running files in parallel races on migrations and on each other's data.
    fileParallelism: false,
  },
});
