import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Backend ESM (Nest 12): swc per decorator e metadata, che esbuild non supporta.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './src',
    include: ['**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['../vitest.setup.ts'],
    // Migra il DB di test prima della suite, solo con TEST_DB_MIGRATE=1 (job CI integration-tests).
    globalSetup: ['../vitest.global-setup.ts'],
    pool: 'forks',
    maxForks: 2,
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      reportOnFailure: true,
      include: ['**/*.(t|j)s'],
      reportsDirectory: '../coverage',
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      // Senza decoratorMetadata la DI di Nest perde i design:paramtypes e
      // Test.createTestingModule().compile() resta appeso.
      jsc: {
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
