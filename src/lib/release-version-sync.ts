import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type PackageJson = {
    version: string;
    dependencies?: Record<string, string>;
};

const HTTP_CLIENT_PACKAGE_NAME = '@bidbeacon/http-client';
const CHANGELOG_VERSION_REGEX = /^## v(\d+\.\d+\.\d+) - \d{4}-\d{2}-\d{2}\s*$/;

export const assertReleaseVersionSync = async (repoRoot = resolve(import.meta.dirname, '../..')) => {
    const [rootPackageJson, apiClientPackageJson, cliPackageJson, bunLock, changelog] = await Promise.all([
        readPackageJson(join(repoRoot, 'package.json')),
        readPackageJson(join(repoRoot, 'packages/bidbeacon-api-client/package.json')),
        readPackageJson(join(repoRoot, 'packages/bidbeacon-cli/package.json')),
        readFile(join(repoRoot, 'bun.lock'), 'utf8'),
        readFile(join(repoRoot, 'CHANGELOG.md'), 'utf8'),
    ]);

    const releaseVersion = rootPackageJson.version;
    const problems: string[] = [];

    if (apiClientPackageJson.version !== releaseVersion) {
        problems.push(`packages/bidbeacon-api-client/package.json version is ${apiClientPackageJson.version}; expected ${releaseVersion}.`);
    }

    if (cliPackageJson.version !== releaseVersion) {
        problems.push(`packages/bidbeacon-cli/package.json version is ${cliPackageJson.version}; expected ${releaseVersion}.`);
    }

    const changelogVersions = readChangelogVersions(changelog);
    if (changelogVersions[0] !== releaseVersion) {
        problems.push(`CHANGELOG.md starts at ${changelogVersions[0] ?? 'no version'}; expected ${releaseVersion}.`);
    }

    const cliHttpClientVersion = cliPackageJson.dependencies?.[HTTP_CLIENT_PACKAGE_NAME];
    if (cliHttpClientVersion !== releaseVersion) {
        problems.push(`packages/bidbeacon-cli/package.json dependency ${HTTP_CLIENT_PACKAGE_NAME} is ${cliHttpClientVersion ?? 'missing'}; expected ${releaseVersion}.`);
    }

    const rootHttpClientVersion = rootPackageJson.dependencies?.[HTTP_CLIENT_PACKAGE_NAME];
    const lockfilePin = readBunLockHttpClientPin(bunLock);
    if (!lockfilePin) {
        problems.push(`bun.lock does not pin ${HTTP_CLIENT_PACKAGE_NAME} to one released version.`);
    } else if (rootHttpClientVersion !== lockfilePin) {
        problems.push(`package.json dependency ${HTTP_CLIENT_PACKAGE_NAME} is ${rootHttpClientVersion ?? 'missing'}; bun.lock pins ${lockfilePin}.`);
    } else if (lockfilePin !== releaseVersion && lockfilePin !== changelogVersions[1]) {
        problems.push(
            `bun.lock pins ${HTTP_CLIENT_PACKAGE_NAME}@${lockfilePin}. Expected ${releaseVersion}, or the previous changelog version ${changelogVersions[1] ?? 'missing'} until npm has ${releaseVersion}.`
        );
    }

    if (problems.length > 0) {
        throw new Error(['Release version sync check failed:', ...problems].join('\n'));
    }
};

const readPackageJson = async (path: string): Promise<PackageJson> => JSON.parse(await readFile(path, 'utf8')) as PackageJson;

const readChangelogVersions = (changelog: string) => {
    const versions: string[] = [];
    for (const line of changelog.split('\n')) {
        const match = CHANGELOG_VERSION_REGEX.exec(line);
        if (match?.[1]) {
            versions.push(match[1]);
        }
    }
    return versions;
};

const readBunLockHttpClientPin = (bunLock: string) => {
    const pins = [...bunLock.matchAll(/"@bidbeacon\/http-client":\s*"(\d+\.\d+\.\d+)"/g)].flatMap(match => (match[1] ? [match[1]] : []));
    const uniquePins = [...new Set(pins)];
    if (uniquePins.length !== 1) {
        return undefined;
    }
    const pin = uniquePins[0];
    if (!(pin && bunLockIncludesPackageVersion(bunLock, pin))) {
        return undefined;
    }
    return pin;
};

const bunLockIncludesPackageVersion = (bunLock: string, version: string) => {
    const dependencyPattern = new RegExp(`"${escapeForRegExp(HTTP_CLIENT_PACKAGE_NAME)}":\\s*"${escapeForRegExp(version)}"`);
    const resolvedPackagePattern = new RegExp(`"${escapeForRegExp(HTTP_CLIENT_PACKAGE_NAME)}": \\["${escapeForRegExp(`${HTTP_CLIENT_PACKAGE_NAME}@${version}`)}"`);

    return dependencyPattern.test(bunLock) && resolvedPackagePattern.test(bunLock);
};

const escapeForRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
