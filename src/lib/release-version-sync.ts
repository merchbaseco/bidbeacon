import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type PackageJson = {
    version: string;
    dependencies?: Record<string, string>;
};

const HTTP_CLIENT_PACKAGE_NAME = '@bidbeacon/http-client';

export const assertReleaseVersionSync = async (repoRoot = resolve(import.meta.dirname, '../..')) => {
    const [rootPackageJson, apiClientPackageJson, cliPackageJson, bunLock] = await Promise.all([
        readPackageJson(join(repoRoot, 'package.json')),
        readPackageJson(join(repoRoot, 'packages/bidbeacon-api-client/package.json')),
        readPackageJson(join(repoRoot, 'packages/bidbeacon-cli/package.json')),
        readFile(join(repoRoot, 'bun.lock'), 'utf8'),
    ]);

    const expectedVersion = rootPackageJson.version;
    const problems: string[] = [];

    if (apiClientPackageJson.version !== expectedVersion) {
        problems.push(`packages/bidbeacon-api-client/package.json version is ${apiClientPackageJson.version}; expected ${expectedVersion}.`);
    }

    if (cliPackageJson.version !== expectedVersion) {
        problems.push(`packages/bidbeacon-cli/package.json version is ${cliPackageJson.version}; expected ${expectedVersion}.`);
    }

    const rootHttpClientVersion = rootPackageJson.dependencies?.[HTTP_CLIENT_PACKAGE_NAME];
    if (rootHttpClientVersion !== expectedVersion) {
        problems.push(`package.json dependency ${HTTP_CLIENT_PACKAGE_NAME} is ${rootHttpClientVersion ?? 'missing'}; expected ${expectedVersion}.`);
    }

    const cliHttpClientVersion = cliPackageJson.dependencies?.[HTTP_CLIENT_PACKAGE_NAME];
    const expectedCliDependencyVersion = `^${expectedVersion}`;
    if (cliHttpClientVersion !== expectedCliDependencyVersion) {
        problems.push(`packages/bidbeacon-cli/package.json dependency ${HTTP_CLIENT_PACKAGE_NAME} is ${cliHttpClientVersion ?? 'missing'}; expected ${expectedCliDependencyVersion}.`);
    }

    if (!bunLockIncludesPackageVersion(bunLock, expectedVersion)) {
        problems.push(`bun.lock is not pinned to ${HTTP_CLIENT_PACKAGE_NAME}@${expectedVersion}. Publish ${HTTP_CLIENT_PACKAGE_NAME}@${expectedVersion} first, then run bun install.`);
    }

    if (problems.length > 0) {
        throw new Error(['Release version sync check failed:', ...problems].join('\n'));
    }
};

const readPackageJson = async (path: string): Promise<PackageJson> => JSON.parse(await readFile(path, 'utf8')) as PackageJson;

const bunLockIncludesPackageVersion = (bunLock: string, version: string) => {
    const dependencyPattern = new RegExp(`"${escapeForRegExp(HTTP_CLIENT_PACKAGE_NAME)}":\\s*"${escapeForRegExp(version)}"`);
    const resolvedPackagePattern = new RegExp(`"${escapeForRegExp(HTTP_CLIENT_PACKAGE_NAME)}": \\["${escapeForRegExp(`${HTTP_CLIENT_PACKAGE_NAME}@${version}`)}"`);

    return dependencyPattern.test(bunLock) && resolvedPackagePattern.test(bunLock);
};

const escapeForRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
