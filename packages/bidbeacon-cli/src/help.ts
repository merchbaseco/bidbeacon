export type HelpTopicKey = 'global' | 'auth' | 'config' | 'advertiser-accounts' | 'search' | 'create' | 'update' | 'changelog';

type HelpRow = { left: string; right: string };

type HelpTopic = {
    key: HelpTopicKey;
    usage: string;
    summary: string;
    options?: HelpRow[];
    commands?: HelpRow[];
    notes?: string[];
};

const CREATE_OPERATIONS = ['sponsored-products-campaign', 'campaign', 'ad-group', 'ad', 'keyword-target', 'product-target', 'negative-keyword', 'negative-product-target'];

const TOPICS: Record<HelpTopicKey, HelpTopic> = {
    global: {
        key: 'global',
        usage: 'bb [options] <command>',
        summary: 'Run the canonical BidBeacon operation contract.',
        options: [{ left: '--version', right: 'Print the CLI version' }],
        commands: [
            { left: 'advertiser-accounts list', right: 'List advertiser accounts available to the credential' },
            { left: 'search <resource>', right: 'Search rows with explicit account, fields, filters, and paging' },
            { left: 'create <operation>', right: 'Create one resource or a Sponsored Products composite' },
            { left: 'update <resource>', right: 'Update one resource with explicit changes' },
            { left: 'auth', right: 'Set, clear, or inspect shared Merchbase API-key auth' },
            { left: 'config', right: 'Configure only the API base URL and storage directory' },
            { left: 'changelog', right: 'Show packaged release notes' },
        ],
        notes: [
            'Every scoped operation requires `--account <advertiser-account-uuid>`.',
            'Success is JSON on stdout. Errors are `{ "error": { "code", "message", "details" } }` on stderr.',
            'Use `bb search --help`, `bb create --help`, or `bb update --help` for operation-specific flags.',
        ],
    },
    auth: {
        key: 'auth',
        usage: 'bb auth <set|clear|status> [options]',
        summary: 'Manage the shared Merchbase API key used by BidBeacon.',
        options: [
            { left: '--stdin', right: 'Read the API key from stdin for `auth set`' },
            { left: '--json', right: 'Print machine-readable status for `auth status`' },
        ],
        commands: [
            { left: 'set [ak_...]', right: 'Save an API key in the supported local secure store' },
            { left: 'clear', right: 'Remove the locally saved API key' },
            { left: 'status', right: `Show auth status; automation may use ${'MERCHBASE_API_KEY'}` },
        ],
    },
    config: {
        key: 'config',
        usage: 'bb config <show|get|set|unset|reset> [key] [value]',
        summary: 'Configure local transport settings. Account selection is not stored.',
        commands: [
            { left: 'show', right: 'Show effective base URL and storage paths' },
            { left: 'get <base-url|storage-dir>', right: 'Read one setting' },
            { left: 'set <base-url|storage-dir> <value>', right: 'Save one setting' },
            { left: 'unset <base-url|storage-dir>', right: 'Remove one setting' },
            { left: 'reset', right: 'Remove saved transport settings' },
        ],
        notes: ['`BB_BASE_URL` and `BB_STORAGE_DIR` override saved settings.', 'There is no configured or selected account.'],
    },
    'advertiser-accounts': {
        key: 'advertiser-accounts',
        usage: 'bb advertiser-accounts list',
        summary: 'List advertiser accounts authorized for the current credential.',
    },
    search: {
        key: 'search',
        usage: 'bb search <campaign|ad-group|ad|target|product|change-event> [options]',
        summary: 'Search canonical resource rows.',
        options: [
            { left: '--account <uuid>', right: 'Required advertiser account UUID' },
            { left: '--fields <field,...>', right: 'Explicit Field vocabulary' },
            { left: '--where <expression>', right: 'Repeatable AND filter; supports =, contains, in, >, >=, <, <=' },
            { left: '--start-date <YYYY-MM-DD>', right: 'Account-local inclusive start date' },
            { left: '--end-date <YYYY-MM-DD>', right: 'Account-local inclusive end date' },
            { left: '--order-by <field:asc|desc,...>', right: 'Stable ordering' },
            { left: '--limit <n>', right: 'Page size, 1-200' },
            { left: '--cursor <value>', right: 'Continue from a server keyset cursor' },
            { left: '--all', right: 'Follow every cursor and emit one final JSON array' },
        ],
        notes: [
            'The Field catalog is intentionally small; use `bb search --help` with the public contract docs for the exact vocabulary.',
            'Repeated `--where` clauses are ANDed. Use `in ["a", "b"]` for alternatives.',
            'Search metrics use canonical names such as `metrics.orders` and `metrics.cvr`.',
            'Performance responses include a full filtered-result summary before pagination.',
            'Product summarizes an ASIN across the account; use Ad for its campaign and ad-group topology.',
        ],
    },
    create: {
        key: 'create',
        usage: 'bb create <operation> --account <uuid> [options]',
        summary: 'Create a canonical resource operation.',
        commands: CREATE_OPERATIONS.map(operation => ({ left: operation, right: `Create ${operation.replaceAll('-', ' ')}` })),
        options: [
            { left: '--account <uuid>', right: 'Required advertiser account UUID' },
            { left: '--json <object|@file|->', right: 'Nested operation input from JSON, a file, or stdin' },
        ],
        notes: ['Primitive operations also accept documented camel-case flags.', 'Flags and JSON may not assign the same property twice.'],
    },
    update: {
        key: 'update',
        usage: 'bb update <campaign|ad-group|ad|target> --account <uuid> [options]',
        summary: 'Update one canonical resource.',
        commands: [
            { left: 'campaign', right: 'Update campaign controls' },
            { left: 'ad-group', right: 'Update ad-group controls' },
            { left: 'ad', right: 'Update ad controls' },
            { left: 'target', right: 'Update target controls' },
        ],
        options: [
            { left: '--account <uuid>', right: 'Required advertiser account UUID' },
            { left: '--json <object|@file|->', right: 'Nested operation input from JSON, a file, or stdin' },
            { left: '--<control> <value>', right: 'Resource-specific change flag' },
        ],
        notes: ['Updates always send `{ accountId, <resource>Id, changes }` to the shared operation.', 'Flags and JSON may not assign the same property twice.'],
    },
    changelog: {
        key: 'changelog',
        usage: 'bb changelog [version] [--all]',
        summary: 'Show packaged CLI release notes.',
        options: [{ left: '--all', right: 'Print the full packaged changelog instead of one version entry' }],
        notes: ['Without a version, prints the current CLI version entry when available.', 'Version accepts `1.2.3` or `v1.2.3`.'],
    },
};

export const resolveHelpTopicKey = (pathSegments: string[]): HelpTopicKey => {
    const first = pathSegments.map(segment => segment.trim().toLowerCase()).filter(Boolean)[0];
    if (first === 'auth' || first === 'config' || first === 'search' || first === 'create' || first === 'update' || first === 'changelog') {
        return first;
    }
    if (first === 'advertiser-accounts') {
        return 'advertiser-accounts';
    }
    return 'global';
};

export const renderHelp = (topicKey: HelpTopicKey, context: { version: string; sha?: string; configSummary?: string }) => {
    const topic = TOPICS[topicKey];
    const shaSuffix = context.sha ? `-${context.sha}` : '';
    const status = context.configSummary ?? 'Try `bb --help` to get started.';
    const lines = [`BidBeacon CLI ${context.version}${shaSuffix} - ${status}`, '', `Usage: ${topic.usage}`, '', topic.summary];
    const options = [{ left: '-h, --help', right: 'Display help for the current command' }, ...(topic.options ?? [])];

    if (options.length > 0) {
        lines.push('', 'Options:', renderRows(options));
    }
    if (topic.commands && topic.commands.length > 0) {
        lines.push('', 'Commands:', renderRows(topic.commands));
    }
    if (topic.notes && topic.notes.length > 0) {
        lines.push('', 'Notes:', ...topic.notes.map(note => `  - ${note}`));
    }
    lines.push('');
    return lines.join('\n');
};

const renderRows = (rows: HelpRow[]) => {
    const width = Math.max(...rows.map(row => row.left.length));
    return rows.map(row => `  ${row.left.padEnd(width)}  ${row.right}`).join('\n');
};
