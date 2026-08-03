import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bb id validation', () => {
    it('prints a helpful error when an ASIN-like value is passed where a numeric campaign id is expected', () => {
        const home = mkdtempSync(join(tmpdir(), 'bb-cli-home-'));
        const configDir = join(home, '.bidbeacon');
        mkdirSync(configDir, { recursive: true });
        writeFileSync(
            join(configDir, 'config.json'),
            JSON.stringify(
                {
                    baseUrl: 'http://127.0.0.1:1',
                    credential: 'ak_test',
                    accountId: '123',
                    countryCode: 'US',
                    range: 'today',
                },
                null,
                2
            ),
            'utf8'
        );

        const cliEntrypoint = resolve(process.cwd(), 'packages/bidbeacon-cli/src/index.ts');
        const result = spawnSync('bun', [cliEntrypoint, 'campaigns', 'pause', 'B0ABCDEF12'], {
            env: { ...process.env, HOME: home },
            encoding: 'utf8',
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Invalid <campaign_id>: expected campaign_id (numeric), received "B0ABCDEF12".');
        expect(result.stderr).toContain('This looks like an ASIN.');
    });
});
