import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..');
const cliPackageDir = join(repoRoot, 'packages', 'bidbeacon-cli');
const tempDirs: string[] = [];

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('bidbeacon cli build', () => {
    it('emits a runnable node entrypoint without bundling server-only code', async () => {
        const tempRoot = join(repoRoot, '.context');
        await mkdir(tempRoot, { recursive: true });

        const tempDir = await mkdtemp(join(tempRoot, 'bidbeacon-cli-build-'));
        tempDirs.push(tempDir);

        const outputFile = join(tempDir, 'bb.js');

        execFileSync('bun', ['build', '../../packages/bidbeacon-cli/src/index.ts', '--target=node', '--format=esm', '--packages=external', '--outfile', outputFile], {
            cwd: cliPackageDir,
            stdio: 'pipe',
        });

        const artifact = await readFile(outputFile, 'utf8');
        expect(artifact.startsWith('#!/usr/bin/env node\n')).toBe(true);
        expect(artifact).not.toContain('BIDBEACON_DATABASE_PASSWORD');
        await expect(access(outputFile, constants.X_OK)).resolves.toBeUndefined();

        const helpOutput = execFileSync(outputFile, ['--help'], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: 'pipe',
        });

        expect(helpOutput).toContain('Usage: bb [options] [command]');
        expect(helpOutput).toContain('BidBeacon CLI');
    });
});
