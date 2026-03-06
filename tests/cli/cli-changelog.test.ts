import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cliEntrypoint = resolve(process.cwd(), 'packages/bidbeacon-cli/src/index.ts');
const cliPackageJsonPath = resolve(process.cwd(), 'packages/bidbeacon-cli/package.json');

const readCliVersion = () => {
    const raw = readFileSync(cliPackageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version: string };
    return parsed.version;
};

describe('bb changelog', () => {
    it('prints the current CLI version entry by default', () => {
        const result = spawnSync('bun', [cliEntrypoint, 'changelog'], {
            env: process.env,
            encoding: 'utf8',
        });

        expect(result.status).toBe(0);
        const output = JSON.parse(result.stdout) as {
            ok: boolean;
            data: {
                currentVersion: string;
                selectedVersion: string;
                entry: {
                    version: string;
                    sections: Array<{ title: string; changes: string[] }>;
                };
            };
        };

        expect(output.ok).toBe(true);
        expect(output.data.currentVersion).toBe(readCliVersion());
        expect(output.data.selectedVersion).toBe(readCliVersion());
        expect(output.data.entry.version).toBe(readCliVersion());
        expect(output.data.entry.sections.some(section => section.title === 'Added')).toBe(true);
    });

    it('prints a requested changelog version', () => {
        const result = spawnSync('bun', [cliEntrypoint, 'changelog', 'v0.2.3'], {
            env: process.env,
            encoding: 'utf8',
        });

        expect(result.status).toBe(0);
        const output = JSON.parse(result.stdout) as {
            ok: boolean;
            data: {
                requestedVersion: string | null;
                selectedVersion: string;
                entry: {
                    version: string;
                };
            };
        };

        expect(output.ok).toBe(true);
        expect(output.data.requestedVersion).toBe('0.2.3');
        expect(output.data.selectedVersion).toBe('0.2.3');
        expect(output.data.entry.version).toBe('0.2.3');
    });
});
