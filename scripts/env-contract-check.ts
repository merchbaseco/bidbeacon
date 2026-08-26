import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Name-only contract check across the four places a BidBeacon variable appears:
 * `.env.schema` (the contract), the bare `process.env.X` reads in the shipped
 * source, the Compose delivery for the server and worker containers, and the
 * build arguments declared as `ARG` in the Dockerfile.
 *
 * BidBeacon has no typed env module, so the source scan IS the consumer side:
 * every name the code reads must be a deliverable schema item and must actually
 * be delivered to the container that reads it. `varlock audit` cannot do this —
 * it does not see Compose or Docker at all. Nothing here resolves a value or
 * contacts 1Password; it compares names and decorators only.
 */
const repositoryRoot = process.cwd();
const schemaPath = join(repositoryRoot, '.env.schema');
const composePath = join(repositoryRoot, 'compose.yml');
const dockerfilePath = join(repositoryRoot, 'Dockerfile');

// Injected by varlock itself rather than delivered to any consumer.
const varlockBuiltins = new Set(['VARLOCK_ENV']);

const schemaItemPattern = /^([A-Z][A-Z0-9_]*)=/u;
const envReadPattern = /^.*\.env\./u;
const composeEntryPattern = /^\s*(?:-\s*([A-Z][A-Z0-9_]*)(?:[:=]|\s*$)|([A-Z][A-Z0-9_]*)[:=])/u;
const dockerfileArgPattern = /^ARG\s+([A-Z][A-Z0-9_]*)/gmu;
const nonSpacePattern = /\S/u;

// The postgres image requires these literal names for first-boot
// initialisation. Compose delivers them to the database container, never to the
// server, so they are exempt from the reverse check.
const postgresImageNames = new Set(['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD']);

// Read on end users' machines by the published @bidbeacon/cli, and by the
// runtime image for its own purposes. Out of the schema by design: renaming one
// would break a published contract or the container itself.
// `DEV` is Vite's own build-time constant, replaced by a literal at bundle
// time. It is a property of how the dashboard is built, not a value anyone
// delivers, so it can never be a schema item.
const outOfContractNames = new Set(['MERCHBASE_API_KEY', 'BB_BASE_URL', 'BB_STORAGE_DIR', 'NODE_ENV', 'HOME', 'PATH', 'DEV']);

// Schema items that deliberately never reach a container, with the reason.
// Anything not listed here that the container code reads must be delivered.
const notDeliveredNames = new Map([
    ['BIDBEACON_DASHBOARD_API_PROXY_TARGET', 'development-only Vite dev-server proxy target'],
    ['BIDBEACON_DEV_HOST', 'development-only Vite dev-server bind address'],
    ['BIDBEACON_DEV_CLERK_SIGN_IN_USER_ID', 'development-only auto sign-in subject; the container must never be able to mint a session for it'],
    ['BIDBEACON_SEARCH_CURSOR_SECRET', 'optional and unprovisioned; the server falls back to a per-process key'],
    ['BIDBEACON_RUN_LIVE_SMOKE', 'opt-in live smoke switch, operator-supplied'],
    ['BIDBEACON_LIVE_ACCOUNT_ID', 'opt-in live smoke input, operator-supplied'],
    ['BIDBEACON_LIVE_ASIN', 'opt-in live smoke input, operator-supplied'],
    ['VITE_BIDBEACON_API_URL', 'build-time dashboard input, not a runtime value'],
    ['VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY', 'build-time dashboard input, passed as a build argument'],
]);

interface SchemaItem {
    hasExplicitSensitivity: boolean;
    isInternal: boolean;
    isSensitive: boolean;
    name: string;
}

const readSchemaItems = (): SchemaItem[] => {
    const contents = readFileSync(schemaPath, 'utf8');
    const dividerIndex = contents.indexOf('\n# ---');
    const body = dividerIndex === -1 ? contents : contents.slice(dividerIndex + 6);

    const items: SchemaItem[] = [];
    let decorators: string[] = [];

    for (const line of body.split('\n')) {
        if (line.startsWith('#')) {
            decorators.push(line);
            continue;
        }

        const match = schemaItemPattern.exec(line);
        if (match) {
            const attached = decorators.join(' ');
            items.push({
                name: match[1],
                isInternal: attached.includes('@internal'),
                isSensitive: attached.includes('@sensitive'),
                hasExplicitSensitivity: attached.includes('@sensitive') || attached.includes('@public'),
            });
        }

        // A blank line (or the item itself) breaks decorator association.
        decorators = [];
    }

    return items;
};

const sourceScanArgs = [
    'src',
    'scripts',
    'packages',
    'vite.config.dashboard.ts',
    'drizzle.config.ts',
    '--include=*.ts',
    '--include=*.tsx',
    '--exclude=*.test.ts',
    '--exclude=*.test.tsx',
    '--exclude=*.d.ts',
    // This file names variables in prose; scanning it would report its own comments.
    '--exclude=env-contract-check.ts',
];

const grepSource = (args: string[]): string => {
    try {
        return execFileSync('grep', [...args, ...sourceScanArgs], { cwd: repositoryRoot, encoding: 'utf8' });
    } catch {
        // grep exits 1 when nothing matches.
        return '';
    }
};

// Direct `process.env.X` / `import.meta.env.X` reads. Used to catch code
// reading a name the schema does not declare.
const readExplicitSourceNames = (): Set<string> => {
    const output = grepSource(['-rhoE', '(process|import\\.meta)\\.env\\.[A-Z][A-Z0-9_]*']);
    const names = new Set<string>();
    for (const match of output.split('\n')) {
        const name = match.replace(envReadPattern, '').trim();
        if (name) {
            names.add(name);
        }
    }
    return names;
};

// Whether a name appears anywhere in the shipped source. BidBeacon reads plenty
// of values indirectly — `requireEnvironment('NAME')`, `env.NAME` on an injected
// object — so a `process.env.` scan alone would wrongly call them unused.
const isMentionedInSource = (name: string): boolean => grepSource(['-rlF', name]).trim().length > 0;

// Same question, but counting the test suite as a consumer too. Some contract
// items (the live smoke switches) are read only by tests, which is a real
// consumer even though nothing ships them to a container.
const isMentionedAnywhere = (name: string): boolean => {
    if (isMentionedInSource(name)) {
        return true;
    }

    try {
        return execFileSync('grep', ['-rlF', name, 'tests'], { cwd: repositoryRoot, encoding: 'utf8' }).trim().length > 0;
    } catch {
        return false;
    }
};

// Compose is indentation-structured, so a block ends at the first line indented
// no deeper than its header. Every matching block is read, because
// `environment:` appears once per service.
const readComposeBlocks = (blockHeader: string, headerIndent: number) => {
    const lines = readFileSync(composePath, 'utf8').split('\n');
    const names: string[] = [];
    let inside = false;

    for (const line of lines) {
        const indent = line.search(nonSpacePattern);
        const isHeader = line.trimEnd().endsWith(blockHeader) && indent === headerIndent;

        if (!inside) {
            inside = isHeader;
            continue;
        }

        if (line.trim() === '' || line.trimStart().startsWith('#')) {
            continue;
        }

        if (indent <= headerIndent) {
            inside = isHeader;
            continue;
        }

        const match = composeEntryPattern.exec(line);
        if (match) {
            names.push(match[1] ?? match[2]);
        }
    }

    return names;
};

const readDockerfileArgs = (): string[] => [...readFileSync(dockerfilePath, 'utf8').matchAll(dockerfileArgPattern)].map(match => match[1]);

const sorted = (names: Iterable<string>) => [...names].sort();

const schemaItems = readSchemaItems();
const deliverableNames = new Set(schemaItems.filter(item => !(item.isInternal || varlockBuiltins.has(item.name))).map(item => item.name));
const explicitSourceNames = readExplicitSourceNames();
const composeEnvNames = new Set(readComposeBlocks('environment:', 4));
const composeBuildArgNames = new Set(readComposeBlocks('args:', 6));
const dockerfileArgNames = new Set(readDockerfileArgs());

const issues: string[] = [];

// 1. Sensitivity must be stated, not inherited. The schema defaults to
//    sensitive, so an unmarked item is safe but ambiguous to readers.
for (const item of schemaItems) {
    if (!item.hasExplicitSensitivity) {
        issues.push(`${item.name} does not declare @sensitive or @public in .env.schema.`);
    }
}

// 2. A VITE_ value is inlined into a public browser bundle at build time.
//    Marking one sensitive means a secret is about to ship to every visitor.
for (const item of schemaItems) {
    if (item.name.startsWith('VITE_') && item.isSensitive) {
        issues.push(`${item.name} is @sensitive but VITE_ values are inlined into the public dashboard bundle.`);
    }
}

// 3. Everything the shipped source reads must be a deliverable schema item, and
//    must actually be delivered unless it is listed as deliberately undelivered.
for (const name of sorted(explicitSourceNames)) {
    if (outOfContractNames.has(name) || name.startsWith('VITE_')) {
        continue;
    }

    if (!deliverableNames.has(name)) {
        issues.push(`${name} is read by the source but is not a deliverable .env.schema item.`);
    } else if (!(composeEnvNames.has(name) || notDeliveredNames.has(name))) {
        issues.push(`${name} is read by the source but is not delivered in any compose \`environment:\` block.`);
    }
}

// 4. Compose must not deliver names nothing reads.
for (const name of sorted(composeEnvNames)) {
    if (postgresImageNames.has(name)) {
        continue;
    }

    if (!deliverableNames.has(name)) {
        issues.push(`${name} is delivered by compose but is not a deliverable .env.schema item.`);
    }

    if (!isMentionedInSource(name)) {
        issues.push(`${name} is delivered by compose but is not read anywhere in the source.`);
    }
}

// 4b. Every deliverable schema item should have a consumer somewhere.
for (const item of schemaItems) {
    if (item.isInternal || varlockBuiltins.has(item.name) || !deliverableNames.has(item.name)) {
        continue;
    }

    if (!(isMentionedAnywhere(item.name) || composeEnvNames.has(item.name) || composeBuildArgNames.has(item.name))) {
        issues.push(`${item.name} is declared in .env.schema but nothing reads or delivers it.`);
    }
}

// 5. Build arguments must be declared on both sides. Docker silently drops a
//    build argument the Dockerfile never declares.
for (const name of sorted(composeBuildArgNames)) {
    if (!dockerfileArgNames.has(name)) {
        issues.push(`${name} is passed as a compose build argument but is not declared as an ARG in Dockerfile (Docker would silently discard it).`);
    }

    if (!deliverableNames.has(name)) {
        issues.push(`${name} is passed as a compose build argument but is not a deliverable .env.schema item.`);
    }
}

for (const name of sorted(dockerfileArgNames)) {
    if (!composeBuildArgNames.has(name)) {
        issues.push(`${name} is declared as an ARG in Dockerfile but is never passed by compose.`);
    }
}

if (issues.length > 0) {
    console.error('Environment contract is out of sync:');
    for (const issue of issues) {
        console.error(`- ${issue}`);
    }
    process.exit(1);
}

console.log(
    `Environment contract is in sync (${deliverableNames.size} deliverable schema variables, ${explicitSourceNames.size} read directly by the source, ${composeEnvNames.size} delivered by compose, ${dockerfileArgNames.size} build arguments).`
);
