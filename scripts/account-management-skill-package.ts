import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

export const ACCOUNT_MANAGEMENT_SKILL_NAME = 'bidbeacon-account-management';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const FRONTMATTER_LINE_BREAK_PATTERN = /\r?\n/;
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/g;
const EXTERNAL_REFERENCE_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INTERFACE_METADATA_KEYS = ['default_prompt', 'display_name', 'short_description'] as const;

type SkillValidationResult = {
    name: typeof ACCOUNT_MANAGEMENT_SKILL_NAME;
    files: string[];
};

export const validateAccountManagementSkill = async (skillDirectory: string): Promise<SkillValidationResult> => {
    const rootDirectory = resolve(skillDirectory);
    const files = (await collectFiles(rootDirectory)).sort();
    const skillMarkdown = await readRequiredFile(rootDirectory, files, 'SKILL.md');
    const frontmatter = parseFrontmatter(skillMarkdown, rootDirectory);

    if (frontmatter.name !== ACCOUNT_MANAGEMENT_SKILL_NAME) {
        throw new Error(`Skill name must be ${ACCOUNT_MANAGEMENT_SKILL_NAME}.`);
    }
    if (!SKILL_NAME_PATTERN.test(frontmatter.name)) {
        throw new Error('Skill name must use lowercase letters, digits, and hyphens.');
    }
    if (frontmatter.description.length < 40 || frontmatter.description.length > 1024 || !frontmatter.description.includes('Use when')) {
        throw new Error('Skill description must explain what it does and when to use it.');
    }
    if (skillMarkdown.includes('[TODO:')) {
        throw new Error('Skill contains unfinished TODO content.');
    }

    const interfaceMetadata = parseInterfaceMetadata(await readRequiredFile(rootDirectory, files, 'agents/openai.yaml'));
    if (interfaceMetadata.short_description.length < 25 || interfaceMetadata.short_description.length > 64) {
        throw new Error('Skill metadata short_description must contain 25 to 64 characters.');
    }
    if (!interfaceMetadata.default_prompt.includes(`$${ACCOUNT_MANAGEMENT_SKILL_NAME}`)) {
        throw new Error(`Skill metadata default_prompt must mention $${ACCOUNT_MANAGEMENT_SKILL_NAME}.`);
    }

    for (const file of files.filter(file => file.endsWith('.md'))) {
        const content = await readFile(resolve(rootDirectory, file), 'utf8');
        for (const localReference of findLocalReferences(content)) {
            const referencedFile = resolve(rootDirectory, relativeDirectory(file), localReference.path);
            if (!(isWithin(rootDirectory, referencedFile) && files.includes(relative(rootDirectory, referencedFile)))) {
                throw new Error(`${file} references missing local file ${localReference.path}.`);
            }
        }
    }

    return { name: ACCOUNT_MANAGEMENT_SKILL_NAME, files };
};

export const packageAccountManagementSkill = async (sourceDirectory: string, distributionDirectory: string) => {
    await validateAccountManagementSkill(sourceDirectory);
    await mkdir(dirname(resolve(distributionDirectory)), { recursive: true });
    await rm(resolve(distributionDirectory), { force: true, recursive: true });
    await cp(resolve(sourceDirectory), resolve(distributionDirectory), { recursive: true });
    return validateAccountManagementSkill(distributionDirectory);
};

const collectFiles = async (directory: string, prefix = ''): Promise<string[]> => {
    const entries = await readdir(resolve(directory, prefix), { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...(await collectFiles(directory, relativePath)));
        } else if (entry.isFile()) {
            files.push(relativePath);
        }
    }

    return files;
};

const readRequiredFile = async (rootDirectory: string, files: string[], file: string) => {
    if (!files.includes(file)) {
        throw new Error(`Skill is missing ${file}.`);
    }
    return readFile(resolve(rootDirectory, file), 'utf8');
};

const parseFrontmatter = (content: string, rootDirectory: string) => {
    const match = content.match(FRONTMATTER_PATTERN);
    if (!match) {
        throw new Error(`SKILL.md in ${rootDirectory} must start with YAML frontmatter.`);
    }

    const values = parseFlatMapping(match[1].split(FRONTMATTER_LINE_BREAK_PATTERN), '', 'Skill frontmatter');
    const keys = [...values.keys()].sort();
    if (keys.join(',') !== 'description,name') {
        throw new Error('Skill frontmatter must contain only name and description.');
    }

    return {
        name: readMappingValue(values, 'name', 'Skill frontmatter'),
        description: readMappingValue(values, 'description', 'Skill frontmatter'),
    };
};

const parseInterfaceMetadata = (content: string) => {
    const lines = content.split(FRONTMATTER_LINE_BREAK_PATTERN).filter(line => line.length > 0);
    if (lines.shift() !== 'interface:') {
        throw new Error('Skill metadata must contain one interface mapping.');
    }

    const values = parseFlatMapping(lines, '  ', 'Skill metadata', true);
    const keys = [...values.keys()].sort();
    if (keys.join(',') !== INTERFACE_METADATA_KEYS.join(',')) {
        throw new Error(`Skill metadata must contain only ${INTERFACE_METADATA_KEYS.join(', ')}.`);
    }

    return {
        default_prompt: readMappingValue(values, 'default_prompt', 'Skill metadata'),
        display_name: readMappingValue(values, 'display_name', 'Skill metadata'),
        short_description: readMappingValue(values, 'short_description', 'Skill metadata'),
    };
};

const parseFlatMapping = (lines: string[], indentation: string, label: string, requireQuotedValues = false) => {
    const values = new Map<string, string>();
    for (const line of lines) {
        const separator = line.indexOf(':');
        if (!line.startsWith(indentation) || line.slice(indentation.length).startsWith(' ') || separator <= indentation.length) {
            throw new Error(`${label} contains a malformed line.`);
        }

        const key = line.slice(indentation.length, separator);
        if (values.has(key)) {
            throw new Error(`${label} contains duplicate ${key}.`);
        }

        const rawValue = line.slice(separator + 1).trim();
        values.set(key, parseScalar(rawValue, label, requireQuotedValues));
    }
    return values;
};

const parseScalar = (rawValue: string, label: string, requireQuotedValue: boolean) => {
    if (!rawValue) {
        throw new Error(`${label} values must be non-empty.`);
    }
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        let value: unknown;
        try {
            value = JSON.parse(rawValue);
        } catch {
            throw new Error(`${label} contains an invalid quoted string.`);
        }
        if (typeof value !== 'string') {
            throw new Error(`${label} contains an invalid quoted string.`);
        }
        if (value.length === 0) {
            throw new Error(`${label} values must be non-empty quoted strings.`);
        }
        return value;
    }
    if (requireQuotedValue || rawValue.startsWith('"') || rawValue.endsWith('"')) {
        throw new Error(`${label} values must be non-empty quoted strings.`);
    }
    return rawValue;
};

const readMappingValue = (values: Map<string, string>, key: string, label: string) => {
    const value = values.get(key);
    if (!value) {
        throw new Error(`${label} is missing ${key}.`);
    }
    return value;
};

const findLocalReferences = (content: string) => {
    const references: { path: string }[] = [];
    for (const match of content.matchAll(MARKDOWN_LINK_PATTERN)) {
        const target = match[1].split('#', 1)[0].split('?', 1)[0];
        if (!target || EXTERNAL_REFERENCE_PATTERN.test(target) || target.startsWith('#')) {
            continue;
        }
        references.push({ path: target });
    }
    return references;
};

const relativeDirectory = (file: string) => {
    const lastSlash = file.lastIndexOf('/');
    return lastSlash === -1 ? '' : file.slice(0, lastSlash);
};

const isWithin = (rootDirectory: string, candidate: string) => {
    const pathFromRoot = relative(rootDirectory, candidate);
    return pathFromRoot !== '..' && !pathFromRoot.startsWith('../') && !pathFromRoot.startsWith('/');
};
