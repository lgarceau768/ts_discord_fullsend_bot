import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setupTests.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'dist/**',
        'coverage/**',
        'tests/**',
        'eslint.config.ts',
        'vitest.config.ts',
        'src/index.ts',
        'src/registerCommands.ts',
        'src/core/events/**',
        'src/core/types/**',
        'src/core/utils/logger.ts',
        'src/features/**/jobs/**',
        'src/features/**/services/**',
        'src/features/**/types/**',
        'src/features/search/searchCache.ts',
      ],
    },
  },
});
