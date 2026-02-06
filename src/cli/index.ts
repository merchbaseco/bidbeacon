#!/usr/bin/env bun
import { createTRPCProxyClient, httpLink } from '@trpc/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { AppRouter } from '../api/router';

const DEFAULT_BASE_URL = 'http://localhost:8080';
const CONFIG_DIR = join(homedir(), '.bidbeacon');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const main = async () => {
    const { positional, flags } = parseArgs(process.argv.slice(2));

    if (flags.help || positional.length === 0) {
        printHelp();
        return;
    }

    const [command, subcommand, action] = positional;

    if (command === 'login') {
        await handleLogin(flags);
        return;
    }

    if (command === 'config') {
        await handleConfigCommand(subcommand, action, positional.slice(3));
        return;
    }

    const config = await loadConfig();
    const resolved = resolveRuntimeConfig(config, flags);

    if (!resolved.apiKey) {
        throw new Error('Missing API key. Set BIDBEACON_API_KEY or run: bb login');
    }

    const client = createTRPCProxyClient<AppRouter>({
        links: [
            httpLink({
                url: `${resolved.baseUrl}/api`,
                headers() {
                    return { Authorization: `Bearer ${resolved.apiKey}` };
                },
            }),
        ],
    });

    switch (command) {
        case 'accounts': {
            if (subcommand !== 'list') {
                throw new Error('Usage: bb accounts list');
            }
            const data = await client.api.accounts.list.query();
            printOutput(data, flags.json);
            return;
        }
        case 'reports': {
            if (subcommand !== 'summary') {
                throw new Error('Usage: bb reports summary --account <id>');
            }
            const accountId = await resolveAccountIdWithDefault(client, resolved, flags);
            if (!accountId) {
                throw new Error('Missing account. Provide --account or set config account.');
            }
            const input = {
                accountId,
                countryCode: readFlag(flags, ['country']) ?? undefined,
                aggregation: readFlag(flags, ['aggregation']) ?? undefined,
                entityType: readFlag(flags, ['entity-type']) ?? undefined,
                statusFilter: readFlag(flags, ['status']) ?? undefined,
                from: readFlag(flags, ['from']) ?? undefined,
                to: readFlag(flags, ['to']) ?? undefined,
                limit: readNumberFlag(flags, ['limit']) ?? undefined,
                offset: readNumberFlag(flags, ['offset']) ?? undefined,
            };
            const data = await client.api.reports.summary.query(stripUndefined(input));
            printOutput(data, flags.json);
            return;
        }
        case 'ads': {
            if (subcommand !== 'campaigns' || action !== 'list') {
                throw new Error('Usage: bb ads campaigns list --account <id>');
            }
            const accountId = await resolveAccountIdWithDefault(client, resolved, flags);
            if (!accountId) {
                throw new Error('Missing account. Provide --account or set config account.');
            }
            const pagination = buildPagination(flags);
            const input = {
                accountId,
                countryCode: readFlag(flags, ['country']) ?? undefined,
                pagination,
            };
            const data = await client.api.ads.campaigns.list.query(stripUndefined(input));
            printOutput(data, flags.json);
            return;
        }
        default:
            throw new Error(`Unknown command: ${command}`);
    }
};

const handleConfigCommand = async (subcommand?: string, action?: string, rest: string[] = []) => {
    if (subcommand === 'show') {
        const config = await loadConfig();
        printOutput(config, false);
        return;
    }

    if (subcommand !== 'set' || !action) {
        throw new Error('Usage: bb config set <api-key|base-url|account> <value>');
    }

    const value = rest[0];
    if (!value) {
        throw new Error('Missing value for config set');
    }

    const config = await loadConfig();
    switch (action) {
        case 'api-key':
            config.apiKey = value;
            break;
        case 'base-url':
            config.baseUrl = value;
            break;
        case 'account':
            config.accountId = value;
            break;
        default:
            throw new Error('Unknown config key. Use api-key, base-url, or account.');
    }

    await saveConfig(config);
    console.log('Saved.');
};

const handleLogin = async (flags: ParsedFlags) => {
    const providedApiKey = readFlag(flags, ['api-key']);
    let apiKey = providedApiKey;

    if (!apiKey) {
        if (!stdin.isTTY || !stdout.isTTY) {
            throw new Error('Cannot prompt for API key in non-interactive mode. Use: bb login --api-key <value>');
        }

        const rl = createInterface({ input: stdin, output: stdout });
        try {
            const enteredApiKey = await rl.question('Enter BidBeacon API key: ');
            apiKey = enteredApiKey.trim();
        } finally {
            rl.close();
        }
    }

    if (!apiKey) {
        throw new Error('API key is required.');
    }

    const config = await loadConfig();
    config.apiKey = apiKey;
    await saveConfig(config);
    console.log('API key saved.');
};

const printHelp = () => {
    console.log(`BidBeacon CLI

Usage:
  bb login [--api-key <value>]
  bb config show
  bb config set api-key <value>
  bb config set base-url <value>
  bb config set account <adsAccountId>

  bb accounts list
  bb reports summary --account <id> [--country US] [--aggregation daily|hourly] [--entity-type target|product]
  bb ads campaigns list --account <id> [--country US]

Options:
  --json                 Output raw JSON
  --base-url <url>       Override API base URL (default ${DEFAULT_BASE_URL})
  --api-key <key>        Override API key
  --account <id>         Override account ID (defaults to dashboard selection)
`);
};

const loadConfig = async () => {
    try {
        const raw = await readFile(CONFIG_PATH, 'utf8');
        return JSON.parse(raw) as CliConfig;
    } catch {
        return {};
    }
};

const saveConfig = async (config: CliConfig) => {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
};

const resolveRuntimeConfig = (config: CliConfig, flags: ParsedFlags) => {
    return {
        baseUrl: readFlag(flags, ['base-url']) ?? process.env.BIDBEACON_API_BASE_URL ?? config.baseUrl ?? DEFAULT_BASE_URL,
        apiKey: readFlag(flags, ['api-key']) ?? process.env.BIDBEACON_API_KEY ?? config.apiKey ?? null,
        accountId: readFlag(flags, ['account']) ?? process.env.BIDBEACON_ACCOUNT_ID ?? config.accountId ?? null,
    };
};

const resolveAccountId = (config: ResolvedConfig, flags: ParsedFlags) => {
    return readFlag(flags, ['account']) ?? config.accountId ?? null;
};

const resolveAccountIdWithDefault = async (
    client: ReturnType<typeof createTRPCProxyClient<AppRouter>>,
    config: ResolvedConfig,
    flags: ParsedFlags
) => {
    const explicitAccountId = resolveAccountId(config, flags);
    if (explicitAccountId) {
        return explicitAccountId;
    }

    const selectedAccount = await client.api.users.getSelectedAccount.query().catch(() => null);
    if (selectedAccount?.adsAccountId) {
        return selectedAccount.adsAccountId;
    }

    const accounts = await client.api.accounts.list.query().catch(() => []);
    const firstAccount = accounts.find(account => account.profileId);
    return firstAccount?.adsAccountId ?? null;
};

const buildPagination = (flags: ParsedFlags) => {
    const limit = readNumberFlag(flags, ['limit']);
    const cursor = readFlag(flags, ['cursor']);
    if (!limit && !cursor) {
        return undefined;
    }
    return {
        limit: limit ?? undefined,
        cursor: cursor ?? undefined,
    };
};

const printOutput = (data: unknown, json: boolean) => {
    if (json) {
        console.log(JSON.stringify(data, null, 2));
        return;
    }

    if (Array.isArray(data)) {
        console.table(data);
        return;
    }

    console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};

const parseArgs = (args: string[]) => {
    const flags: ParsedFlags = {};
    const positional: string[] = [];

    let index = 0;
    while (index < args.length) {
        const value = args[index];
        if (!value.startsWith('--')) {
            positional.push(value);
            index += 1;
            continue;
        }

        const [rawKey, inlineValue] = value.slice(2).split('=');
        const key = rawKey.trim();
        if (!key) {
            index += 1;
            continue;
        }

        if (inlineValue !== undefined) {
            flags[key] = inlineValue;
            index += 1;
            continue;
        }

        const next = args[index + 1];
        if (!next || next.startsWith('--')) {
            flags[key] = true;
            index += 1;
            continue;
        }

        flags[key] = next;
        index += 2;
    }

    return { positional, flags };
};

const readFlag = (flags: ParsedFlags, keys: string[]) => {
    for (const key of keys) {
        const value = flags[key];
        if (typeof value === 'string') {
            return value;
        }
    }
    return null;
};

const readNumberFlag = (flags: ParsedFlags, keys: string[]) => {
    const value = readFlag(flags, keys);
    if (!value) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
};

const stripUndefined = <T extends Record<string, unknown>>(input: T) => {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    return Object.fromEntries(entries) as T;
};

type CliConfig = {
    baseUrl?: string;
    apiKey?: string;
    accountId?: string;
};

type ParsedFlags = Record<string, string | boolean> & {
    json?: boolean;
    help?: boolean;
};

type ResolvedConfig = {
    baseUrl: string;
    apiKey: string | null;
    accountId: string | null;
};

await main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
