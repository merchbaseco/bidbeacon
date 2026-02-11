#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SECTION_ORDER = ['Added', 'Changed', 'Fixed', 'Removed', 'Docs'] as const;

const TYPE_TO_SECTION: Record<string, (typeof SECTION_ORDER)[number]> = {
    build: 'Changed',
    chore: 'Changed',
    ci: 'Changed',
    docs: 'Docs',
    feat: 'Added',
    fix: 'Fixed',
    perf: 'Changed',
    refactor: 'Changed',
    revert: 'Removed',
    style: 'Changed',
    test: 'Changed',
};

const ACRONYMS = ['api', 'asin', 'aws', 'cli', 'csv', 'dlq', 'id', 'ids', 'sdk', 'sqs', 'ui', 'url', 'ux'];
const CONVENTIONAL_COMMIT_PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?:!)?:\s(?<message>.+)$/;
const TRAILING_PR_REFERENCE_PATTERN = /\s+\(#\d+\)\s*$/;
const AMAZON_ADS_PATTERN = /\bamazon ads\b/gi;
const ACRONYM_PATTERNS = ACRONYMS.map(acronym => ({
    pattern: new RegExp(`(?<!-)\\b${acronym}\\b(?!-)`, 'gi'),
    replacement: acronym.toUpperCase(),
}));

const run = () => {
    const args = parseArgs(process.argv.slice(2));

    if (!args.from) {
        printUsageAndExit();
    }

    const commits = getCommitSubjects(args.from, args.to);
    const grouped = groupBySection(commits);
    const heading = args.version ? `## ${args.version}${args.date ? ` - ${args.date}` : ''}` : '## Unreleased';
    const entry = renderEntry(heading, grouped);

    if (!args.prepend) {
        process.stdout.write(`${entry}\n`);
        return;
    }

    const filePath = args.file ?? 'CHANGELOG.md';
    const existing = readFileSync(filePath, 'utf8');
    const updated = prependEntry(existing, entry);
    writeFileSync(filePath, updated);
    process.stdout.write(`Updated ${filePath}\n`);
};

const parseArgs = (argv: string[]) => {
    const parsed: {
        from?: string;
        to?: string;
        version?: string;
        date?: string;
        file?: string;
        prepend: boolean;
    } = { prepend: false };

    for (let index = 0; index < argv.length; index++) {
        const token = argv[index];
        if (token === '--prepend') {
            parsed.prepend = true;
            continue;
        }

        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
            continue;
        }

        if (token === '--from') {
            parsed.from = value;
            index++;
            continue;
        }

        if (token === '--to') {
            parsed.to = value;
            index++;
            continue;
        }

        if (token === '--version') {
            parsed.version = value;
            index++;
            continue;
        }

        if (token === '--date') {
            parsed.date = value;
            index++;
            continue;
        }

        if (token === '--file') {
            parsed.file = value;
            index++;
        }
    }

    return parsed;
};

const getCommitSubjects = (from: string, to?: string) => {
    const command = ['log', '--no-merges', '--pretty=format:%s', `--since=${from}`];

    if (to) {
        command.push(`--until=${to}`);
    }

    const output = execFileSync('git', command, { encoding: 'utf8' }).trim();
    if (output.length === 0) {
        return [];
    }

    return output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
};

const groupBySection = (commits: string[]) => {
    const grouped = new Map<(typeof SECTION_ORDER)[number], string[]>();

    for (const commit of commits) {
        const parsed = parseConventionalCommit(commit);
        const section = TYPE_TO_SECTION[parsed.type] ?? 'Changed';
        const lines = grouped.get(section);
        if (lines) {
            lines.push(parsed.message);
            continue;
        }

        grouped.set(section, [parsed.message]);
    }

    return grouped;
};

const parseConventionalCommit = (subject: string) => {
    const match = subject.match(CONVENTIONAL_COMMIT_PATTERN);

    if (!match?.groups) {
        return {
            message: subject,
            type: 'chore',
        };
    }

    const type = match.groups.type;
    const scope = match.groups.scope;
    const rawMessage = match.groups.message;
    const normalizedMessage = rawMessage.replace(TRAILING_PR_REFERENCE_PATTERN, '').trim();
    const scopedMessage = scope ? `${scope}: ${normalizedMessage}` : normalizedMessage;
    const formattedMessage = formatMessage(scopedMessage);

    return {
        message: formattedMessage,
        type,
    };
};

const formatMessage = (message: string) => {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
        return trimmed;
    }

    const capitalized = `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`;
    const withAcronyms = ACRONYM_PATTERNS.reduce((current, acronym) => {
        return current.replace(acronym.pattern, acronym.replacement);
    }, capitalized);

    return withAcronyms.replace(AMAZON_ADS_PATTERN, 'Amazon Ads');
};

const renderEntry = (heading: string, sections: Map<(typeof SECTION_ORDER)[number], string[]>) => {
    const lines = [heading, ''];

    for (const section of SECTION_ORDER) {
        const entries = sections.get(section);
        if (!entries || entries.length === 0) {
            continue;
        }

        lines.push(`### ${section}`);
        lines.push('');
        for (const entry of entries) {
            lines.push(`- ${entry}`);
        }
        lines.push('');
    }

    if (lines.at(-1) === '') {
        lines.pop();
    }

    return lines.join('\n');
};

const prependEntry = (existing: string, entry: string) => {
    if (!existing.startsWith('# Changelog')) {
        return `${entry}\n\n${existing}`;
    }

    const lines = existing.split('\n');
    const head = lines[0];
    const rest = lines.slice(1).join('\n').trimStart();

    return `${head}\n\n${entry}\n\n${rest}\n`;
};

const printUsageAndExit = () => {
    const usage = [
        'Usage:',
        '  tsx scripts/changelog.ts --from <date> [--to <date>] [--version <vX.Y>] [--date <YYYY-MM-DD>]',
        '  tsx scripts/changelog.ts --from <date> [--to <date>] --version <vX.Y> --date <YYYY-MM-DD> --prepend [--file CHANGELOG.md]',
    ].join('\n');

    process.stderr.write(`${usage}\n`);
    process.exit(1);
};

run();
