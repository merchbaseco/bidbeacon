import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cliEntrypoint = resolve(process.cwd(), 'packages/bidbeacon-cli/src/index.ts');
const cliPackageJsonPath = resolve(process.cwd(), 'packages/bidbeacon-cli/package.json');

describe('bb changelog', () => {
    it('prints the current CLI version entry by default', () => {
        const result = spawnSync('bun', [cliEntrypoint, 'changelog'], { env: process.env, encoding: 'utf8' });
        expect(result.status).toBe(0);
        const output = JSON.parse(result.stdout) as { currentVersion: string; selectedVersion: string; entry: { version: string; sections: unknown[] } };
        const version = (JSON.parse(readFileSync(cliPackageJsonPath, 'utf8')) as { version: string }).version;
        expect(output.currentVersion).toBe(version);
        expect(output.selectedVersion).toBe(version);
        expect(output.entry.version).toBe(version);
        expect(output.entry.sections.length).toBeGreaterThan(0);
    });

    it('prints a requested version without a success envelope', () => {
        const result = spawnSync('bun', [cliEntrypoint, 'changelog', 'v0.2.3'], { env: process.env, encoding: 'utf8' });
        expect(result.status).toBe(0);
        const output = JSON.parse(result.stdout) as { selectedVersion: string; entry: { version: string } };
        expect(output.selectedVersion).toBe('0.2.3');
        expect(output.entry.version).toBe('0.2.3');
    });
});
