import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deployedRevisionStampRelativePath, parseCommitSha, readExpectedRevision, revisionBuildAlias, revisionStampSource } from '@/health/revision-stamp';

const validSha = '0123456789abcdef0123456789abcdef01234567';

describe('parseCommitSha', () => {
    it('accepts a 40-character lowercase hex SHA', () => {
        expect(parseCommitSha(validSha)).toBe(validSha);
    });

    it('rejects dev, empty, short, and uppercase values', () => {
        expect(() => parseCommitSha('dev')).toThrow();
        expect(() => parseCommitSha('')).toThrow();
        expect(() => parseCommitSha('0123456789abcdef0123456789abcdef0123456')).toThrow();
        expect(() => parseCommitSha('0123456789ABCDEF0123456789ABCDEF01234567')).toThrow();
    });
});

describe('revisionStampSource', () => {
    it('returns the stamp module text', () => {
        expect(revisionStampSource(validSha)).toBe(`export const deployedRevision = "${validSha}";\n`);
    });
});

describe('revisionBuildAlias', () => {
    let tempDir: string | undefined;

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
            tempDir = undefined;
        }
    });

    it('returns no aliases when the stamp file is absent', () => {
        tempDir = mkdtempSync(join(tmpdir(), 'revision-alias-'));
        expect(revisionBuildAlias(tempDir)).toEqual([]);
    });

    it('returns the deployed-revision alias when the stamp file exists', () => {
        tempDir = mkdtempSync(join(tmpdir(), 'revision-alias-'));
        const stampPath = join(tempDir, deployedRevisionStampRelativePath);
        mkdirSync(join(tempDir, 'src/health'), { recursive: true });
        writeFileSync(stampPath, revisionStampSource(validSha), 'utf8');

        const aliases = revisionBuildAlias(tempDir);
        expect(aliases).toHaveLength(1);
        const find = aliases[0]?.find;
        if (!(find instanceof RegExp)) {
            throw new Error('revision alias find must be a regular expression');
        }
        expect('@/health/deployed-revision'.replace(find, stampPath)).toBe(stampPath);
        expect('@/health/deployed-revision.ts'.replace(find, stampPath)).toBe('@/health/deployed-revision.ts');
        expect(aliases[0]?.replacement).toBe(stampPath);
    });
});

describe('readExpectedRevision', () => {
    it('parses zero or one --expected-revision flag', () => {
        expect(readExpectedRevision([])).toBeUndefined();
        expect(readExpectedRevision(['--expected-revision', validSha])).toBe(validSha);
        expect(() => readExpectedRevision(['--expected-revision'])).toThrow();
        expect(() => readExpectedRevision(['--expected-revision', validSha, '--expected-revision', validSha])).toThrow();
    });
});
