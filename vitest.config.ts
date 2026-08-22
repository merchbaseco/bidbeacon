import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        // The operation suites boot PGlite, a WebAssembly Postgres. That takes
        // a couple of seconds on a developer machine and considerably longer on
        // a cold CI runner, so vitest's 5s default is too tight to be a useful
        // signal — it fails on hardware speed rather than on behaviour.
        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
});
