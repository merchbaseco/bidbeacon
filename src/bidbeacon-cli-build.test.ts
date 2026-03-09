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
        const tempDir = await createTempDir('bidbeacon-cli-build-');
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

    it('persists a custom storage directory across commands', async () => {
        const tempDir = await createTempDir('bidbeacon-cli-storage-');
        tempDirs.push(tempDir);

        const outputFile = join(tempDir, 'bb.js');
        const homeDir = join(tempDir, 'home');
        const customStorageDir = join(tempDir, 'custom-storage');
        const cliEnv = { BB_API_KEY: 'bbk_test' };

        await mkdir(homeDir, { recursive: true });

        execFileSync('bun', ['build', '../../packages/bidbeacon-cli/src/index.ts', '--target=node', '--format=esm', '--packages=external', '--outfile', outputFile], {
            cwd: cliPackageDir,
            stdio: 'pipe',
        });

        runCli(outputFile, homeDir, ['config', 'set', 'base-url', 'https://example.com'], cliEnv);
        runCli(outputFile, homeDir, ['config', 'set', 'storage-dir', customStorageDir], cliEnv);
        runCli(outputFile, homeDir, ['config', 'set', 'range', '7d'], cliEnv);

        const settingsPath = join(homeDir, '.bidbeacon', 'settings.json');
        const defaultConfigPath = join(homeDir, '.bidbeacon', 'config.json');
        const customConfigPath = join(customStorageDir, 'config.json');

        await expect(readJson(settingsPath)).resolves.toEqual({ storageDir: customStorageDir });
        await expect(readJson(defaultConfigPath)).resolves.toEqual({ baseUrl: 'https://example.com' });
        await expect(readJson(customConfigPath)).resolves.toEqual({
            baseUrl: 'https://example.com',
            range: '7d',
        });

        const showOutput = runCli(outputFile, homeDir, ['config', 'show'], cliEnv);
        const parsed = JSON.parse(showOutput) as {
            data: { storageDir: string; configPath: string; config: { baseUrl?: string; range?: string } };
        };

        expect(parsed.data.storageDir).toBe(customStorageDir);
        expect(parsed.data.configPath).toBe(customConfigPath);
        expect(parsed.data.config).toEqual({
            baseUrl: 'https://example.com',
            range: '7d',
        });
    });
});

const createTempDir = async (prefix: string) => {
    const tempRoot = join(repoRoot, '.context');
    await mkdir(tempRoot, { recursive: true });
    return mkdtemp(join(tempRoot, prefix));
};

const runCli = (outputFile: string, homeDir: string, args: string[], extraEnv?: Record<string, string>) => {
    return execFileSync(outputFile, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
            ...process.env,
            HOME: homeDir,
            ...extraEnv,
        },
        stdio: 'pipe',
    });
};

const readJson = async (path: string) => {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as unknown;
};
