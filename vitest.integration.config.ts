import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// The heavy integration lane. `vitest.config.ts` deliberately discovers
// `*.test.ts` only, so the suites that boot PGlite — a WebAssembly Postgres
// carrying the production migrations — are named `*.integration-check.ts` and
// run here, via `bun run test:integration`. Structural, not a list: a new
// database-backed suite joins the lane by taking the suffix.
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: 'node',
        include: ['src/**/*.integration-check.ts', 'tests/**/*.integration-check.ts'],
        // Booting PGlite takes a couple of seconds on a developer machine and
        // considerably longer on a cold CI runner, so vitest's 5s default is
        // too tight to be a useful signal — it fails on hardware speed rather
        // than on behaviour.
        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
});
