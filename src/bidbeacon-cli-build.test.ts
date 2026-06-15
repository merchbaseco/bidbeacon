import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
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
        expect(helpOutput).toContain('auth');
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
        runCli(outputFile, homeDir, ['config', 'set', 'account', '123', 'US'], cliEnv);

        const settingsPath = join(homeDir, '.bidbeacon', 'settings.json');
        const defaultConfigPath = join(homeDir, '.bidbeacon', 'config.json');
        const customConfigPath = join(customStorageDir, 'config.json');

        await expect(readJson(settingsPath)).resolves.toEqual({ storageDir: customStorageDir });
        await expect(readJson(defaultConfigPath)).resolves.toEqual({ baseUrl: 'https://example.com' });
        await expect(readJson(customConfigPath)).resolves.toEqual({
            baseUrl: 'https://example.com',
            accountId: '123',
            countryCode: 'US',
        });

        const showOutput = runCli(outputFile, homeDir, ['config', 'show'], cliEnv);
        const parsed = JSON.parse(showOutput) as {
            data: { storageDir: string; configPath: string; config: { baseUrl?: string; accountId?: string; countryCode?: string } };
        };

        expect(parsed.data.storageDir).toBe(customStorageDir);
        expect(parsed.data.configPath).toBe(customConfigPath);
        expect(parsed.data.config).toEqual({
            baseUrl: 'https://example.com',
            accountId: '123',
            countryCode: 'US',
        });

        const getOutput = runCli(outputFile, homeDir, ['config', 'get', 'base-url'], cliEnv);
        expect(JSON.parse(getOutput)).toMatchObject({
            data: {
                key: 'base-url',
                value: 'https://example.com',
            },
        });

        runCli(outputFile, homeDir, ['config', 'unset', 'account'], cliEnv);
        const unsetOutput = runCli(outputFile, homeDir, ['config', 'show'], cliEnv);
        expect(JSON.parse(unsetOutput).data.config).toEqual({
            baseUrl: 'https://example.com',
        });

        runCli(outputFile, homeDir, ['config', 'reset'], cliEnv);
        const resetOutput = runCli(outputFile, homeDir, ['config', 'show'], cliEnv);
        expect(JSON.parse(resetOutput).data.config).toEqual({});
    });

    it('applies env overrides for all CLI config values', async () => {
        const tempDir = await createTempDir('bidbeacon-cli-env-');
        tempDirs.push(tempDir);

        const outputFile = join(tempDir, 'bb.js');
        const homeDir = join(tempDir, 'home');
        const envStorageDir = join(tempDir, 'env-storage');

        await mkdir(homeDir, { recursive: true });
        await mkdir(envStorageDir, { recursive: true });

        execFileSync('bun', ['build', '../../packages/bidbeacon-cli/src/index.ts', '--target=node', '--format=esm', '--packages=external', '--outfile', outputFile], {
            cwd: cliPackageDir,
            stdio: 'pipe',
        });

        await writeJson(join(homeDir, '.bidbeacon', 'config.json'), {
            baseUrl: 'https://config.example',
            accountId: '111',
            countryCode: 'US',
        });
        await writeJson(join(envStorageDir, 'config.json'), {
            baseUrl: 'https://env-storage.example',
            accountId: '222',
            countryCode: 'GB',
        });

        const showOutput = runCli(outputFile, homeDir, ['config', 'show'], {
            BB_API_KEY: 'bbk_test',
            BB_STORAGE_DIR: envStorageDir,
            BB_BASE_URL: 'https://env.example',
            BB_ACCOUNT_ID: '333',
            BB_COUNTRY_CODE: 'CA',
        });
        const parsed = JSON.parse(showOutput) as {
            data: { storageDir: string; configPath: string; config: { baseUrl?: string; accountId?: string; countryCode?: string } };
        };

        expect(parsed.data.storageDir).toBe(envStorageDir);
        expect(parsed.data.configPath).toBe(join(envStorageDir, 'config.json'));
        expect(parsed.data.config).toEqual({
            baseUrl: 'https://env.example',
            accountId: '333',
            countryCode: 'CA',
        });
    });
});

const createTempDir = async (prefix: string) => {
    const tempRoot = join(repoRoot, '.context');
    await mkdir(tempRoot, { recursive: true });
    return mkdtemp(join(tempRoot, prefix));
};

const runCli = (outputFile: string, homeDir: string, args: string[], extraEnv?: Record<string, string>) => {
    const { BB_ACCOUNT_ID: _bbAccountId, BB_API_KEY: _bbApiKey, BB_BASE_URL: _bbBaseUrl, BB_COUNTRY_CODE: _bbCountryCode, BB_STORAGE_DIR: _bbStorageDir, ...baseEnv } = process.env;

    return execFileSync(outputFile, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
            ...baseEnv,
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

const writeJson = async (path: string, value: unknown) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2));
};
