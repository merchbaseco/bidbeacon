import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// The fast lane. This config discovers `*.test.ts` and nothing else, which is
// what keeps the PGlite database-simulation suites out of it: those are named
// `*.integration-check.ts` and run through `vitest.integration.config.ts` via
// `bun run test:integration`. Do not widen this `include` to swallow the heavy
// lane back into every commit.
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        // Generous relative to what this lane needs, deliberately: the CLI
        // contract suites spawn real subprocesses, and a cold CI runner should
        // never turn hardware speed into a test signal.
        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
});
