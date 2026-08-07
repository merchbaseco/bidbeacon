import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..');
const cliPackageDir = join(repoRoot, 'packages', 'bidbeacon-cli');
const tempDirs: string[] = [];

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('bidbeacon cli build', () => {
    it('emits a runnable canonical entrypoint without bundling server-only code', async () => {
        const tempDir = await createTempDir('bidbeacon-cli-build-');
        tempDirs.push(tempDir);
        const outputFile = join(tempDir, 'bb.js');

        buildCli(outputFile);

        const artifact = await readFile(outputFile, 'utf8');
        expect(artifact.startsWith('#!/usr/bin/env node\n')).toBe(true);
        expect(artifact).not.toContain('BIDBEACON_DATABASE_PASSWORD');
        await expect(access(outputFile, constants.X_OK)).resolves.toBeUndefined();

        const helpOutput = execFileSync(outputFile, ['--help'], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
        expect(helpOutput).toContain('BidBeacon CLI');
        expect(helpOutput).toContain('advertiser-accounts list');
        expect(helpOutput).not.toContain('campaigns list');
        expect(helpOutput).not.toContain('metrics');
        expect(helpOutput).not.toContain('asins');
    });

    it('persists only transport configuration and never an account selection', async () => {
        const tempDir = await createTempDir('bidbeacon-cli-storage-');
        tempDirs.push(tempDir);
        const outputFile = join(tempDir, 'bb.js');
        const homeDir = join(tempDir, 'home');
        const customStorageDir = join(tempDir, 'custom-storage');
        await mkdir(homeDir, { recursive: true });
        buildCli(outputFile);

        runCli(outputFile, homeDir, ['config', 'set', 'base-url', 'https://example.com']);
        runCli(outputFile, homeDir, ['config', 'set', 'storage-dir', customStorageDir]);

        const settingsPath = join(homeDir, '.bidbeacon', 'settings.json');
        const configPath = join(customStorageDir, 'config.json');
        expect(await readJson(settingsPath)).toEqual({ storageDir: customStorageDir });
        expect(await readJson(configPath)).toEqual({ baseUrl: 'https://example.com' });

        const show = JSON.parse(runCli(outputFile, homeDir, ['config', 'show'])) as {
            storageDir: string;
            configPath: string;
            config: Record<string, unknown>;
        };
        expect(show.storageDir).toBe(customStorageDir);
        expect(show.configPath).toBe(configPath);
        expect(show.config).toEqual({ baseUrl: 'https://example.com' });

        expect(() =>
            execFileSync(outputFile, ['config', 'set', 'account', '123'], {
                cwd: repoRoot,
                env: { ...process.env, HOME: homeDir },
                encoding: 'utf8',
                stdio: 'pipe',
            })
        ).toThrow();
    });

    it('reads release notes from the installed package layout', async () => {
        const tempDir = await createTempDir('bidbeacon-cli-package-');
        tempDirs.push(tempDir);
        const packageDir = join(tempDir, 'node_modules', '@bidbeacon', 'cli');
        const outputFile = join(packageDir, 'dist', 'index.js');
        await mkdir(join(packageDir, 'dist'), { recursive: true });
        await Promise.all([copyFile(join(cliPackageDir, 'package.json'), join(packageDir, 'package.json')), copyFile(join(cliPackageDir, 'CHANGELOG.md'), join(packageDir, 'CHANGELOG.md'))]);
        buildCli(outputFile);

        const output = execFileSync(outputFile, ['changelog'], {
            cwd: tempDir,
            encoding: 'utf8',
            env: { ...process.env, HOME: tempDir, MERCHBASE_API_KEY: 'ak_test' },
            stdio: 'pipe',
        });

        expect(JSON.parse(output)).toMatchObject({
            currentVersion: '1.0.0',
            selectedVersion: '1.0.0',
            entry: { version: '1.0.0' },
        });
    });
});

const buildCli = (outputFile: string) => {
    execFileSync('bun', ['build', '../../packages/bidbeacon-cli/src/index.ts', '--target=node', '--format=esm', '--packages=external', '--outfile', outputFile], {
        cwd: cliPackageDir,
        stdio: 'pipe',
    });
};

const runCli = (outputFile: string, homeDir: string, args: string[]) =>
    execFileSync(outputFile, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, HOME: homeDir, MERCHBASE_API_KEY: 'ak_test' },
        stdio: 'pipe',
    });

const createTempDir = async (prefix: string) => {
    const tempRoot = join(repoRoot, '.context');
    await mkdir(tempRoot, { recursive: true });
    return mkdtemp(join(tempRoot, prefix));
};

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown;
