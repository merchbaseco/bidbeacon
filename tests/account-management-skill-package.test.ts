import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { validateAccountManagementSkill } from '../scripts/account-management-skill-package';
import { MCP_TOOL_NAMES } from '../src/mcp/operation-definitions';

const sourceSkillDirectory = resolve('skills/bidbeacon-account-management');
const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);
const expectedSkillFiles = ['SKILL.md', 'agents/openai.yaml', 'references/diagnosis.md', 'references/optimization-and-launch.md', 'references/partial-failure-recovery.md'];
const expectedDockerBuildScripts = ['!scripts/account-management-skill-package.ts', '!scripts/package-account-management-skill.ts'];
const LINE_BREAK_PATTERN = /\r?\n/;

describe('BidBeacon account-management skill package', () => {
    afterEach(async () => {
        await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })));
    });

    it('validates the source skill manifest and every referenced local file', async () => {
        await expect(validateAccountManagementSkill(sourceSkillDirectory)).resolves.toEqual({
            name: 'bidbeacon-account-management',
            files: expectedSkillFiles,
        });
    });

    it('packages an exact self-contained copy through the production package command', async () => {
        const stagingDirectory = await mkdtemp(join(tmpdir(), 'bidbeacon-skill-package-'));
        temporaryDirectories.push(stagingDirectory);
        const distributionDirectory = join(stagingDirectory, 'dist', 'skills', 'bidbeacon-account-management');

        await execFileAsync('bun', ['scripts/package-account-management-skill.ts', distributionDirectory], { cwd: resolve('.') });

        await expect(validateAccountManagementSkill(distributionDirectory)).resolves.toEqual({
            name: 'bidbeacon-account-management',
            files: expectedSkillFiles,
        });
        for (const file of expectedSkillFiles) {
            await expect(readFile(join(distributionDirectory, file), 'utf8')).resolves.toBe(await readFile(join(sourceSkillDirectory, file), 'utf8'));
        }
    });

    it('wires the package command into the server build and runtime image', async () => {
        const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as { scripts: Record<string, string> };
        const dockerfile = await readFile(resolve('Dockerfile'), 'utf8');
        const dockerignore = await readFile(resolve('.dockerignore'), 'utf8');

        expect(packageJson.scripts.build).toBe('vite build && bun run skill:package');
        expect(packageJson.scripts['skill:package']).toBe('bun scripts/package-account-management-skill.ts');
        expect(dockerfile).toContain('bun run build');
        expect(dockerfile).toContain('COPY --from=build /app/dist ./dist');
        expect(dockerignore.split(LINE_BREAK_PATTERN)).not.toContain('scripts');
        expect(dockerignore.split(LINE_BREAK_PATTERN).filter(line => line.startsWith('!scripts/'))).toEqual(expectedDockerBuildScripts);
    });

    it('uses only exact operation names exposed by the MCP', async () => {
        const markdown = (await Promise.all(expectedSkillFiles.filter(file => file.endsWith('.md')).map(file => readFile(join(sourceSkillDirectory, file), 'utf8')))).join('\n');
        const mentionedOperations = [...markdown.matchAll(/`(search|[a-z]+(?:_[a-z]+)+)`/g)].map(match => match[1]).filter(name => name !== 'change_event');

        expect([...new Set(mentionedOperations)].sort()).toEqual([...MCP_TOOL_NAMES].sort());
    });

    it('rejects malformed interface metadata and duplicate frontmatter', async () => {
        const skillDirectory = await createTemporarySkill();
        await writeFile(
            join(skillDirectory, 'agents', 'openai.yaml'),
            'interface:\n  display_name: ""\n  short_description: "Diagnose, optimize, and launch ad accounts"\n  default_prompt: "Use $bidbeacon-account-management."\n'
        );
        await expect(validateAccountManagementSkill(skillDirectory)).rejects.toThrow('non-empty');

        const originalSkill = await readFile(join(sourceSkillDirectory, 'SKILL.md'), 'utf8');
        await writeFile(join(skillDirectory, 'agents', 'openai.yaml'), await readFile(join(sourceSkillDirectory, 'agents', 'openai.yaml'), 'utf8'));
        await writeFile(join(skillDirectory, 'SKILL.md'), originalSkill.replace('name: bidbeacon-account-management', 'name: wrong\nname: bidbeacon-account-management'));
        await expect(validateAccountManagementSkill(skillDirectory)).rejects.toThrow('duplicate name');
    });

    it('rejects a missing progressive-disclosure reference', async () => {
        const skillDirectory = await createTemporarySkill();
        await rm(join(skillDirectory, 'references', 'diagnosis.md'));

        await expect(validateAccountManagementSkill(skillDirectory)).rejects.toThrow('references missing local file references/diagnosis.md');
    });
});

const createTemporarySkill = async () => {
    const stagingDirectory = await mkdtemp(join(tmpdir(), 'bidbeacon-skill-validation-'));
    temporaryDirectories.push(stagingDirectory);
    const skillDirectory = join(stagingDirectory, 'bidbeacon-account-management');
    await cp(sourceSkillDirectory, skillDirectory, { recursive: true });
    return skillDirectory;
};
