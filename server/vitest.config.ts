import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './vitest.globalSetup.ts',
    setupFiles: ['./vitest.setup.ts'],
    // Run test FILES serially — integration tests share a DB and cannot run concurrently.
    // Individual tests within a file still run sequentially by default.
    fileParallelism: false,
    // Separate include patterns so unit vs integration can be run independently
    include: ['src/tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/services/**',
        'src/middlewares/**',
        'src/repositories/**',
        'src/controllers/**',
        'src/utils/**',
      ],
      exclude: [
        'src/utils/benchmark.ts',
      ],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 75,
        lines: 75,
      },
    },
    // Increase timeout for integration tests that hit real DB + bcrypt
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
