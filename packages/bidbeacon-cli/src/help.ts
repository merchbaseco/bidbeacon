type HelpRow = {
    left: string;
    right: string;
};

export type HelpTopicKey = 'global' | 'config' | 'accounts' | 'campaigns' | 'ad-groups' | 'ads' | 'asins' | 'targets' | 'bids' | 'metrics' | 'metrics series' | 'metrics table' | 'enums';

type HelpTopic = {
    key: HelpTopicKey;
    usage: string;
    summary: string;
    options?: HelpRow[];
    commands?: HelpRow[];
    notes?: string[];
};

const TOPICS: Record<HelpTopicKey, HelpTopic> = {
    global: {
        key: 'global',
        usage: 'bb [options] [command]',
        summary: 'BidBeacon CLI',
        commands: [
            { left: 'config', right: 'Manage local CLI configuration (API key, base URL, default account, range)' },
            { left: 'accounts', right: 'List accessible Amazon Ads accounts' },
            { left: 'campaigns', right: 'Manage campaigns (list/get/create/update/pause/resume/delete)' },
            { left: 'ad-groups', right: 'Manage ad groups' },
            { left: 'ads', right: 'Manage ads' },
            { left: 'asins', right: 'Inspect ASIN-scoped campaign trees' },
            { left: 'targets', right: 'Manage targeting (keywords/product targets)' },
            { left: 'bids', right: 'Set or adjust bids for a target' },
            { left: 'metrics', right: 'Fetch chart/table metrics' },
            { left: 'enums', right: 'Print enum values accepted by the API' },
        ],
    },
    config: {
        key: 'config',
        usage: 'bb config [options] [command]',
        summary: 'Manage local CLI configuration',
        commands: [
            { left: 'show', right: 'Print the current config file' },
            { left: 'clear', right: 'Clear the config file' },
            { left: 'set api-key <value>', right: 'Set API key used for requests' },
            { left: 'set base-url <value>', right: 'Set API base URL (default: http://localhost:8080)' },
            { left: 'set account <adsAccountId> <countryCode>', right: 'Set default advertiser account + country' },
            {
                left: 'set range <value>',
                right: 'Set default range (today|yesterday|Nd|YYYY-MM-DD..YYYY-MM-DD; aliases: t|y|w|week|m|month)',
            },
        ],
        notes: ['Date ranges are interpreted in the selected account timezone (derived from `countryCode`).'],
    },
    accounts: {
        key: 'accounts',
        usage: 'bb accounts [options] [command]',
        summary: 'List accounts you can access',
        commands: [{ left: 'list', right: 'List accounts' }],
    },
    campaigns: {
        key: 'campaigns',
        usage: 'bb campaigns [options] [command]',
        summary: 'Manage campaigns',
        options: [
            { left: '--state <value>', right: 'ENABLED|PAUSED|ARCHIVED|OTHER|ALL' },
            { left: '--all', right: 'Alias for --state ALL (where supported)' },
            { left: '--limit <n>', right: 'Limit number of results (list)' },
            { left: '--offset <n>', right: 'Offset results (list)' },
            { left: '--name <value>', right: 'Name for update' },
            { left: '--portfolio <id>', right: 'Portfolio id for update' },
            { left: '--start <iso>', right: 'Start datetime (ISO) for update' },
            { left: '--end <iso>', right: 'End datetime (ISO) for update' },
        ],
        commands: [
            { left: 'list', right: 'List campaigns' },
            { left: 'get <campaign_id>', right: 'Fetch a campaign' },
            { left: 'create <name> <budget>', right: 'Create a campaign' },
            { left: 'update <campaign_id> --name <name>', right: 'Update fields on a campaign' },
            { left: 'pause <campaign_id>', right: 'Pause a campaign' },
            { left: 'resume <campaign_id>', right: 'Resume a campaign' },
            { left: 'delete <campaign_id>', right: 'Delete a campaign' },
            { left: 'set-budget <campaign_id> <budget>', right: 'Set campaign budget' },
            { left: 'set-bid-strategy <campaign_id> <strategy>', right: 'Set bid strategy' },
            { left: 'set-bid-adjustments <campaign_id> <placement|audience|creative> <json>', right: 'Set bid adjustments JSON' },
        ],
    },
    'ad-groups': {
        key: 'ad-groups',
        usage: 'bb ad-groups [options] [command]',
        summary: 'Manage ad groups',
        options: [
            { left: '--state <value>', right: 'ENABLED|PAUSED|ARCHIVED|OTHER|ALL' },
            { left: '--all', right: 'Alias for --state ALL (where supported)' },
            { left: '--campaign <campaign_id>', right: 'Filter to a campaign (list)' },
            { left: '--limit <n>', right: 'Limit number of results (list)' },
            { left: '--offset <n>', right: 'Offset results (list)' },
        ],
        commands: [
            { left: 'list', right: 'List ad groups' },
            { left: 'get <ad_group_id>', right: 'Fetch an ad group' },
            { left: 'create <campaign_id> <name> <default_bid>', right: 'Create an ad group' },
            { left: 'update <ad_group_id> <name>', right: 'Update an ad group name' },
            { left: 'set-default-bid <ad_group_id> <value>', right: 'Update default bid' },
            { left: 'pause <ad_group_id>', right: 'Pause an ad group' },
            { left: 'resume <ad_group_id>', right: 'Resume an ad group' },
            { left: 'delete <ad_group_id>', right: 'Delete an ad group' },
        ],
    },
    ads: {
        key: 'ads',
        usage: 'bb ads [options] [command]',
        summary: 'Manage ads',
        options: [
            { left: '--state <value>', right: 'ENABLED|PAUSED|ARCHIVED|OTHER|ALL' },
            { left: '--all', right: 'Alias for --state ALL (where supported)' },
            { left: '--campaign <campaign_id>', right: 'Filter to a campaign (list)' },
            { left: '--ad-group <ad_group_id>', right: 'Filter to an ad group (list)' },
            { left: '--asin <ASIN>', right: 'Filter to ads that advertise a specific ASIN (list)' },
            { left: '--limit <n>', right: 'Limit number of results (list)' },
            { left: '--offset <n>', right: 'Offset results (list)' },
        ],
        commands: [
            { left: 'list', right: 'List ads' },
            { left: 'get <ad_id>', right: 'Fetch an ad' },
            { left: 'create <ad_group_id> <asin|sku> [ASIN|SKU]', right: 'Create an ad' },
            { left: 'update <ad_id> <state>', right: 'Update ad state' },
            { left: 'delete <ad_id>', right: 'Delete an ad' },
        ],
    },
    asins: {
        key: 'asins',
        usage: 'bb asins [options] [command]',
        summary: 'Inspect ASIN-scoped campaign trees',
        commands: [{ left: 'get <asin>', right: 'Fetch campaigns/ad groups/targets relevant to an ASIN' }],
    },
    targets: {
        key: 'targets',
        usage: 'bb targets [options] [command]',
        summary: 'Manage targeting',
        options: [
            { left: '--state <value>', right: 'ENABLED|PAUSED|ARCHIVED|OTHER|ALL' },
            { left: '--all', right: 'Alias for --state ALL (where supported)' },
            { left: '--campaign <campaign_id>', right: 'Filter to a campaign (list)' },
            { left: '--ad-group <ad_group_id>', right: 'Filter to an ad group (list)' },
            { left: '--negative <true|false>', right: 'Filter to negative or non-negative targets (list)' },
            { left: '--limit <n>', right: 'Limit number of results (list)' },
            { left: '--offset <n>', right: 'Offset results (list)' },
        ],
        commands: [
            { left: 'list', right: 'List targets' },
            { left: 'get <target_id>', right: 'Fetch a target' },
            { left: 'create keyword <ad_group_id> <keyword> <match_type> <bid>', right: 'Create a keyword target' },
            { left: 'create product <ad_group_id> <asin|sku> <match_type> <bid> [ASIN|SKU]', right: 'Create a product target' },
            { left: 'set-bid <target_id> <value>', right: 'Set a bid' },
            { left: 'adjust-bid <target_id> <delta>', right: 'Adjust a bid by delta' },
            { left: 'pause <target_id>', right: 'Pause a target' },
            { left: 'resume <target_id>', right: 'Resume a target' },
            { left: 'delete <target_id>', right: 'Delete a target' },
        ],
    },
    bids: {
        key: 'bids',
        usage: 'bb bids [options] [command]',
        summary: 'Set or adjust bids',
        commands: [
            { left: 'set <target_id> <value>', right: 'Set bid to an absolute value' },
            { left: 'adjust <target_id> <delta>', right: 'Add delta to the current bid' },
        ],
    },
    metrics: {
        key: 'metrics',
        usage: 'bb metrics [options] [command]',
        summary: 'Fetch metrics series or tables',
        commands: [
            { left: 'series', right: 'Time series metrics (chart-ready)' },
            { left: 'table', right: 'Sortable table metrics' },
        ],
        notes: [
            'Common flags: --metrics <keys> --range <range> --filter <expr> (repeatable) --search <text> --state <value> --all',
            'Range values: today|yesterday|Nd|YYYY-MM-DD..YYYY-MM-DD (aliases: t=today, y=yesterday, w|week=7d, m|month=30d)',
            'Range values are interpreted in the selected account timezone (derived from `countryCode`).',
            'Filter expr format: <key><op><value> where op is one of <= >= != = < > ~',
            'Filter keys: search|name, state|status|active-status, targeting|type, target-type, target-match-type, budget, end-date, out-of-budget, <metric>|metrics.<metric>',
            'Operators by key: search/name (=|~), state/targeting/type keys (=), out-of-budget (=|!=), budget/end-date/metric (=|>=|<=|>|<)',
        ],
    },
    'metrics series': {
        key: 'metrics series',
        usage: 'bb metrics series [options] [command]',
        summary: 'Time series metrics (chart-ready)',
        options: [
            { left: '--ids <id1,id2,...>', right: 'Limit to entity ids' },
            { left: '--range <range>', right: 'Override configured range (today|yesterday|Nd|YYYY-MM-DD..YYYY-MM-DD + aliases)' },
            { left: '--bucket <value>', right: 'auto|hour|day|week|month|year' },
            { left: '--campaign <campaign_id>', right: 'Scope to a campaign (ad-groups/ads/targets); alias: --campaign-id' },
            { left: '--ad-group <ad_group_id>', right: 'Scope to an ad group (ads/targets); alias: --ad-group-id' },
            { left: '--metrics <keys>', right: 'Comma-separated metric keys' },
            { left: '--filter <expr>', right: 'Repeatable filter expression' },
            { left: '--search <text>', right: 'Search by name' },
            { left: '--state <value>', right: 'ENABLED|PAUSED|ARCHIVED|OTHER|ALL (or --all)' },
        ],
        commands: [
            { left: 'campaigns', right: 'Campaign series metrics' },
            { left: 'ad-groups', right: 'Ad group series metrics' },
            { left: 'ads', right: 'Ad series metrics' },
            { left: 'targets', right: 'Target series metrics' },
        ],
        notes: [
            '--metrics omitted: returns all metric keys.',
            '--bucket auto uses hour for single-day ranges, otherwise day.',
            '--bucket hour requires a single-day range.',
            'Series does not support --sort, --direction, --limit, or --offset.',
        ],
    },
    'metrics table': {
        key: 'metrics table',
        usage: 'bb metrics table [options] [command]',
        summary: 'Table metrics (sortable)',
        options: [
            { left: '--ids <id1,id2,...>', right: 'Limit to entity ids' },
            { left: '--range <range>', right: 'Override configured range (today|yesterday|Nd|YYYY-MM-DD..YYYY-MM-DD + aliases)' },
            { left: '--sort <field>', right: 'impressions|clicks|purchases|spend|sales|acos|cpc|ctr|roas' },
            { left: '--direction <value>', right: 'asc|desc' },
            { left: '--limit <n>', right: 'Limit number of results' },
            { left: '--offset <n>', right: 'Offset results' },
            { left: '--campaign <campaign_id>', right: 'Scope to a campaign (ad-groups/ads/targets); alias: --campaign-id' },
            { left: '--ad-group <ad_group_id>', right: 'Scope to an ad group (ads/targets); alias: --ad-group-id' },
            { left: '--metrics <keys>', right: 'Comma-separated metric keys' },
            { left: '--filter <expr>', right: 'Repeatable filter expression' },
            { left: '--search <text>', right: 'Search by name' },
            { left: '--state <value>', right: 'ENABLED|PAUSED|ARCHIVED|OTHER|ALL (or --all)' },
        ],
        commands: [
            { left: 'campaigns', right: 'Campaign table metrics' },
            { left: 'ad-groups', right: 'Ad group table metrics' },
            { left: 'ads', right: 'Ad table metrics' },
            { left: 'targets', right: 'Target table metrics' },
        ],
        notes: ['--metrics omitted: returns all metric keys.', 'Defaults: --sort spend and --direction desc.', 'Table does not support --bucket.'],
    },
    enums: {
        key: 'enums',
        usage: 'bb enums [options] [command]',
        summary: 'Print enum values accepted by the API',
        commands: [
            { left: 'bid-strategy', right: 'Bid strategy values' },
            { left: 'match-type', right: 'Match type values' },
            { left: 'placement', right: 'Placement values' },
            { left: 'state', right: 'State values' },
        ],
    },
};

export const resolveHelpTopicKey = (pathSegments: string[]): HelpTopicKey => {
    const normalized = pathSegments.map(segment => segment.trim()).filter(Boolean);

    if (normalized.length === 0) {
        return 'global';
    }

    const joined2 = normalized.slice(0, 2).join(' ').toLowerCase();
    if (joined2 === 'metrics series') {
        return 'metrics series';
    }
    if (joined2 === 'metrics table') {
        return 'metrics table';
    }

    const first = normalized[0]?.toLowerCase();
    if (!first) {
        return 'global';
    }
    if (first === 'config') {
        return 'config';
    }
    if (first === 'accounts') {
        return 'accounts';
    }
    if (first === 'campaigns') {
        return 'campaigns';
    }
    if (first === 'ad-groups') {
        return 'ad-groups';
    }
    if (first === 'ads') {
        return 'ads';
    }
    if (first === 'asins') {
        return 'asins';
    }
    if (first === 'targets') {
        return 'targets';
    }
    if (first === 'bids') {
        return 'bids';
    }
    if (first === 'metrics') {
        return 'metrics';
    }
    if (first === 'enums') {
        return 'enums';
    }
    return 'global';
};

export const renderHelp = (topicKey: HelpTopicKey, context: { version: string; sha?: string; configSummary?: string }) => {
    const topic = TOPICS[topicKey];
    const header = renderHeader(context);

    const lines: string[] = [];
    lines.push(header);
    lines.push('');
    lines.push(`Usage: ${topic.usage}`);
    lines.push('');
    lines.push(topic.summary);

    const options = topic.options ? [...topic.options] : [];
    options.unshift({ left: '-h, --help', right: 'Display help for the current command' });

    if (options.length > 0) {
        lines.push('');
        lines.push('Options:');
        lines.push(renderRows(options));
    }

    if (topic.commands && topic.commands.length > 0) {
        lines.push('');
        lines.push('Commands:');
        lines.push(renderRows(topic.commands));
    }

    if (topic.notes && topic.notes.length > 0) {
        lines.push('');
        lines.push('Notes:');
        for (const note of topic.notes) {
            lines.push(`  - ${note}`);
        }
    }

    lines.push('');
    return lines.join('\n');
};

const renderHeader = (context: { version: string; sha?: string; configSummary?: string }) => {
    const shaSuffix = context.sha ? `-${context.sha}` : '';
    const status = context.configSummary ? context.configSummary : 'Try `bb --help` to get started.';
    return `BidBeacon ${context.version}${shaSuffix} - ${status}`;
};

const renderRows = (rows: HelpRow[]) => {
    const leftWidth = Math.max(...rows.map(row => row.left.length));
    return rows
        .map(row => {
            const left = row.left.padEnd(leftWidth, ' ');
            return `  ${left}  ${row.right}`;
        })
        .join('\n');
};
