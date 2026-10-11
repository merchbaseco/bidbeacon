import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const deployedRevisionStampRelativePath = 'src/health/deployed-revision.stamp.ts';

const commitShaPattern = /^[0-9a-f]{40}$/;
const deployedRevisionSpecifier = /^@\/health\/deployed-revision$/;

export const parseCommitSha = (value: string): string => {
    if (!commitShaPattern.test(value)) {
        throw new Error(`Invalid commit SHA: ${value}`);
    }

    return value;
};

export const revisionStampSource = (sha: string): string => {
    const parsed = parseCommitSha(sha);
    return `export const deployedRevision = ${JSON.stringify(parsed)};\n`;
};

export const revisionBuildAlias = (repositoryRoot: string) => {
    const stampPath = join(repositoryRoot, deployedRevisionStampRelativePath);
    if (!existsSync(stampPath)) {
        return [];
    }

    return [
        {
            find: deployedRevisionSpecifier,
            replacement: stampPath,
        },
    ];
};

export const writeRevisionStamp = (repositoryRoot: string, sha: string) => {
    const stampPath = join(repositoryRoot, deployedRevisionStampRelativePath);
    writeFileSync(stampPath, revisionStampSource(sha), 'utf8');
};

export const removeRevisionStamp = (repositoryRoot: string) => {
    const stampPath = join(repositoryRoot, deployedRevisionStampRelativePath);
    if (existsSync(stampPath)) {
        unlinkSync(stampPath);
    }
};

export const readExpectedRevision = (argv: string[]): string | undefined => {
    const flag = '--expected-revision';
    const indices = argv.reduce<number[]>((found, arg, index) => {
        if (arg === flag) {
            found.push(index);
        }
        return found;
    }, []);

    if (indices.length === 0) {
        return undefined;
    }

    if (indices.length > 1) {
        throw new Error('Duplicate --expected-revision flag');
    }

    const value = argv[indices[0] + 1];
    if (value === undefined || value.startsWith('-')) {
        throw new Error('Missing value for --expected-revision');
    }

    return parseCommitSha(value);
};
