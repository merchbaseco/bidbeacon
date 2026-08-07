import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { validateAccountManagementSkill } from '../scripts/account-management-skill-package';
import { MCP_TOOL_NAMES } from '../src/mcp/operation-definitions';

const sourceSkillDirectory = resolve('skills/bidbeacon-amazon-ads');
const evaluationCasesFile = resolve('tests/fixtures/account-management-skill-cases.json');
const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);
const expectedSkillFiles = [
    'SKILL.md',
    'agents/openai.yaml',
    'references/account-review.md',
    'references/add-recipe.md',
    'references/investigate-campaign.md',
    'references/investigate-product.md',
    'references/launch-campaign.md',
    'references/manage-negatives.md',
    'references/optimize-resource.md',
    'references/pause-or-archive.md',
    'references/recover-partial-launch.md',
];
const recipeFiles = expectedSkillFiles.filter(file => file.startsWith('references/'));
const expectedDockerBuildScripts = ['!scripts/account-management-skill-package.ts', '!scripts/package-account-management-skill.ts'];
const LINE_BREAK_PATTERN = /\r?\n/;
const RECIPE_HEADING_PATTERN = /^# Recipe: /;
const WORD_PATTERN = /\S+/g;

describe('BidBeacon Amazon Ads skill package', () => {
    afterEach(async () => {
        await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })));
    });

    it('validates the source skill manifest and every referenced local file', async () => {
        await expect(validateAccountManagementSkill(sourceSkillDirectory)).resolves.toEqual({
            name: 'bidbeacon-amazon-ads',
            files: expectedSkillFiles,
        });
    });

    it('packages an exact self-contained copy through the production package command', async () => {
        const stagingDirectory = await mkdtemp(join(tmpdir(), 'bidbeacon-skill-package-'));
        temporaryDirectories.push(stagingDirectory);
        const distributionDirectory = join(stagingDirectory, 'dist', 'skills', 'bidbeacon-amazon-ads');

        await execFileAsync('bun', ['scripts/package-account-management-skill.ts', distributionDirectory], { cwd: resolve('.') });

        await expect(validateAccountManagementSkill(distributionDirectory)).resolves.toEqual({
            name: 'bidbeacon-amazon-ads',
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

    it('uses only operation names exposed by the MCP', async () => {
        const markdown = (await Promise.all(expectedSkillFiles.filter(file => file.endsWith('.md')).map(file => readFile(join(sourceSkillDirectory, file), 'utf8')))).join('\n');
        const mentionedOperations = [...markdown.matchAll(/`(search|[a-z]+(?:_[a-z]+)+)`/g)].map(match => match[1]).filter(name => name !== 'change_event');

        expect(mentionedOperations.length).toBeGreaterThan(0);
        expect(mentionedOperations.every(operation => MCP_TOOL_NAMES.includes(operation as (typeof MCP_TOOL_NAMES)[number]))).toBe(true);
    });

    it('keeps every disclosed recipe compact and directly reachable from the router', async () => {
        const router = await readFile(join(sourceSkillDirectory, 'SKILL.md'), 'utf8');
        expect(router.match(WORD_PATTERN)?.length).toBeLessThanOrEqual(250);

        for (const file of recipeFiles) {
            const recipe = await readFile(join(sourceSkillDirectory, file), 'utf8');
            expect(router).toContain(`(${file})`);
            expect(recipe).toMatch(RECIPE_HEADING_PATTERN);
            expect(recipe).toContain('\n## Done\n');
            expect(recipe.match(WORD_PATTERN)?.length).toBeLessThanOrEqual(180);
        }
    });

    it('keeps a real-workflow evaluation case for every recipe', async () => {
        const cases = JSON.parse(await readFile(evaluationCasesFile, 'utf8')) as { prompt: string; recipe: string; checks: string[] }[];

        expect(new Set(cases.map(testCase => testCase.prompt)).size).toBe(cases.length);
        expect([...new Set(cases.map(testCase => testCase.recipe))].sort()).toEqual(recipeFiles);
        for (const testCase of cases) {
            expect(testCase.prompt.length).toBeGreaterThan(20);
            expect(testCase.checks.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('rejects malformed interface metadata and duplicate frontmatter', async () => {
        const skillDirectory = await createTemporarySkill();
        await writeFile(
            join(skillDirectory, 'agents', 'openai.yaml'),
            'interface:\n  display_name: ""\n  short_description: "Diagnose, optimize, and launch ad accounts"\n  default_prompt: "Use $bidbeacon-amazon-ads."\n'
        );
        await expect(validateAccountManagementSkill(skillDirectory)).rejects.toThrow('non-empty');

        const originalSkill = await readFile(join(sourceSkillDirectory, 'SKILL.md'), 'utf8');
        await writeFile(join(skillDirectory, 'agents', 'openai.yaml'), await readFile(join(sourceSkillDirectory, 'agents', 'openai.yaml'), 'utf8'));
        await writeFile(join(skillDirectory, 'SKILL.md'), originalSkill.replace('name: bidbeacon-amazon-ads', 'name: wrong\nname: bidbeacon-amazon-ads'));
        await expect(validateAccountManagementSkill(skillDirectory)).rejects.toThrow('duplicate name');
    });

    it('requires the model-facing description to identify the Amazon Ads domain', async () => {
        const skillDirectory = await createTemporarySkill();
        const skill = await readFile(join(skillDirectory, 'SKILL.md'), 'utf8');
        await writeFile(join(skillDirectory, 'SKILL.md'), skill.replaceAll('Amazon Ads', 'advertising'));

        await expect(validateAccountManagementSkill(skillDirectory)).rejects.toThrow('must identify Amazon Ads');
    });

    it('rejects a missing progressive-disclosure reference', async () => {
        const skillDirectory = await createTemporarySkill();
        await rm(join(skillDirectory, 'references', 'account-review.md'));

        await expect(validateAccountManagementSkill(skillDirectory)).rejects.toThrow('references missing local file references/account-review.md');
    });
});

const createTemporarySkill = async () => {
    const stagingDirectory = await mkdtemp(join(tmpdir(), 'bidbeacon-skill-validation-'));
    temporaryDirectories.push(stagingDirectory);
    const skillDirectory = join(stagingDirectory, 'bidbeacon-amazon-ads');
    await cp(sourceSkillDirectory, skillDirectory, { recursive: true });
    return skillDirectory;
};
