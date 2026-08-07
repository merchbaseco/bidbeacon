import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bb scoped command validation', () => {
    it('requires an explicit advertiser account instead of consulting local selection state', () => {
        const cliEntrypoint = resolve(process.cwd(), 'packages/bidbeacon-cli/src/index.ts');
        const result = spawnSync('bun', [cliEntrypoint, 'search', 'campaign'], {
            env: { ...process.env, BB_ACCOUNT_ID: 'legacy-account', BB_COUNTRY_CODE: 'US', MERCHBASE_API_KEY: 'ak_test' },
            encoding: 'utf8',
        });

        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    });
});
