import { defineConfig } from 'vitest/config'

/**
 * `packages/core` is pure (no Prisma, no IO, no Next.js) and is the module the
 * AGENTS §4 coverage gate applies to: ≥70% statements/branches/functions/lines.
 * `pnpm test` (no coverage) stays fast; CI runs `test:coverage`, which enforces
 * the thresholds below and fails the build if coverage regresses.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
})
