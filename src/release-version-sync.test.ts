import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertReleaseVersionSync } from './lib/release-version-sync';

const tempDirs: string[] = [];

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('release version sync', () => {
    it('keeps the release versions aligned while the root install still pins the previous client', async () => {
        await expect(assertReleaseVersionSync()).resolves.toBeUndefined();
    });

    it('accepts a root install pinned to the previous changelog version', async () => {
        const root = await writeFixture({
            releaseVersion: '3.2.0',
            apiClientVersion: '3.2.0',
            cliVersion: '3.2.0',
            cliDependency: '3.2.0',
            rootDependency: '3.1.0',
            lockfilePin: '3.1.0',
            changelog: '# Changelog\n\n## v3.2.0 - 2026-10-23\n\n## v3.1.0 - 2026-08-10\n',
        });

        await expect(assertReleaseVersionSync(root)).resolves.toBeUndefined();
    });

    it('accepts a root install pinned to the release after that client is published', async () => {
        const root = await writeFixture({
            releaseVersion: '3.2.0',
            apiClientVersion: '3.2.0',
            cliVersion: '3.2.0',
            cliDependency: '3.2.0',
            rootDependency: '3.2.0',
            lockfilePin: '3.2.0',
            changelog: '# Changelog\n\n## v3.2.0 - 2026-10-23\n\n## v3.1.0 - 2026-08-10\n',
        });

        await expect(assertReleaseVersionSync(root)).resolves.toBeUndefined();
    });

    it('rejects a client package that is behind the app release', async () => {
        const root = await writeFixture({
            releaseVersion: '3.2.0',
            apiClientVersion: '3.1.0',
            cliVersion: '3.2.0',
            cliDependency: '3.2.0',
            rootDependency: '3.1.0',
            lockfilePin: '3.1.0',
            changelog: '# Changelog\n\n## v3.2.0 - 2026-10-23\n\n## v3.1.0 - 2026-08-10\n',
        });

        await expect(assertReleaseVersionSync(root)).rejects.toThrow('Release version sync check failed:\npackages/bidbeacon-api-client/package.json version is 3.1.0; expected 3.2.0.');
    });

    it('rejects a root dependency that disagrees with bun.lock', async () => {
        const root = await writeFixture({
            releaseVersion: '3.2.0',
            apiClientVersion: '3.2.0',
            cliVersion: '3.2.0',
            cliDependency: '3.2.0',
            rootDependency: '3.2.0',
            lockfilePin: '3.1.0',
            changelog: '# Changelog\n\n## v3.2.0 - 2026-10-23\n\n## v3.1.0 - 2026-08-10\n',
        });

        await expect(assertReleaseVersionSync(root)).rejects.toThrow('Release version sync check failed:\npackage.json dependency @bidbeacon/http-client is 3.2.0; bun.lock pins 3.1.0.');
    });

    it('rejects a lockfile pin older than the previous changelog version', async () => {
        const root = await writeFixture({
            releaseVersion: '3.2.0',
            apiClientVersion: '3.2.0',
            cliVersion: '3.2.0',
            cliDependency: '3.2.0',
            rootDependency: '3.0.0',
            lockfilePin: '3.0.0',
            changelog: '# Changelog\n\n## v3.2.0 - 2026-10-23\n\n## v3.1.0 - 2026-08-10\n',
        });

        await expect(assertReleaseVersionSync(root)).rejects.toThrow(
            'Release version sync check failed:\nbun.lock pins @bidbeacon/http-client@3.0.0. Expected 3.2.0, or the previous changelog version 3.1.0 until npm has 3.2.0.'
        );
    });
});

type ReleaseFixture = {
    releaseVersion: string;
    apiClientVersion: string;
    cliVersion: string;
    cliDependency: string;
    rootDependency: string;
    lockfilePin: string;
    changelog: string;
};

const writeFixture = async (fixture: ReleaseFixture) => {
    const root = await mkdtemp(join(tmpdir(), 'bidbeacon-release-'));
    tempDirs.push(root);
    await mkdir(join(root, 'packages', 'bidbeacon-api-client'), { recursive: true });
    await mkdir(join(root, 'packages', 'bidbeacon-cli'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: fixture.releaseVersion, dependencies: { '@bidbeacon/http-client': fixture.rootDependency } }));
    await writeFile(join(root, 'packages', 'bidbeacon-api-client', 'package.json'), JSON.stringify({ version: fixture.apiClientVersion }));
    await writeFile(join(root, 'packages', 'bidbeacon-cli', 'package.json'), JSON.stringify({ version: fixture.cliVersion, dependencies: { '@bidbeacon/http-client': fixture.cliDependency } }));
    await writeFile(join(root, 'CHANGELOG.md'), fixture.changelog);
    await writeFile(join(root, 'bun.lock'), lockfile(fixture.lockfilePin));
    return root;
};

const lockfile = (version: string) =>
    `{
  "workspaces": {
    "": {
      "dependencies": {
        "@bidbeacon/http-client": "${version}"
      }
    }
  },
  "packages": {
    "@bidbeacon/http-client": ["@bidbeacon/http-client@${version}", "", {}, "sha512-abc"]
  }
}
`;
