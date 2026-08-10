#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type BidBeaconClient, createBidBeaconClient, type RouterInputs } from '@bidbeacon/http-client';
import { clearStoredApiKey, getMissingApiKeyMessage, loadAuthState, setStoredApiKey } from './auth';
import { normalizeApiBaseUrl, withTransportHint } from './base-url';
import { renderHelp, resolveHelpTopicKey } from './help';

const DEFAULT_BASE_URL = 'http://localhost:8080';
const DEFAULT_STORAGE_DIR = join(homedir(), '.bidbeacon');
const DEFAULT_SETTINGS_PATH = join(DEFAULT_STORAGE_DIR, 'settings.json');
const CONFIG_FILENAME = 'config.json';
const STORAGE_DIR_ENV_VAR = 'BB_STORAGE_DIR';
const BASE_URL_ENV_VAR = 'BB_BASE_URL';
const CHANGELOG_ENTRY_REGEX = /^##\s+v?([^\s]+)\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/;
const CHANGELOG_SECTION_REGEX = /^###\s+(.+?)\s*$/;
const CHANGELOG_LINES_REGEX = /\r?\n/;
const CHANGELOG_BULLET_REGEX = /^[-*]\s+/;
const CHANGELOG_SOURCES = [new URL('../CHANGELOG.md', import.meta.url), new URL('../../../CHANGELOG.md', import.meta.url)] as const;
const FILTER_TOKEN_REGEX = /^[A-Za-z0-9_.:/-]+$/;
const INTEGER_REGEX = /^[0-9]+$/;
const VERSION_PREFIX_REGEX = /^v/i;
const WHERE_SYMBOL_EXPRESSION_REGEX = /^(?<field>[A-Za-z][A-Za-z0-9_.]*)\s*(?<operator>>=|<=|>|<|=)\s*(?<value>.+)$/;
const WHERE_WORD_EXPRESSION_REGEX = /^(?<field>[A-Za-z][A-Za-z0-9_.]*)\s+(?<operator>contains|in)\s+(?<value>.+)$/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEARCH_FIELD_NAMES = new Set([
    'campaign.id',
    'campaign.name',
    'campaign.state',
    'campaign.deliveryStatus',
    'campaign.dailyBudget',
    'campaign.targetingMode',
    'campaign.bidStrategy',
    'campaign.startDate',
    'campaign.endDate',
    'adGroup.id',
    'adGroup.name',
    'adGroup.state',
    'adGroup.deliveryStatus',
    'adGroup.defaultBid',
    'ad.id',
    'ad.state',
    'ad.deliveryStatus',
    'ad.asin',
    'ad.productTitle',
    'ad.type',
    'target.id',
    'target.state',
    'target.deliveryStatus',
    'target.type',
    'target.scope',
    'target.bid',
    'target.negative',
    'target.keyword',
    'target.asin',
    'target.matchType',
    'product.asin',
    'product.title',
    'changeEvent.id',
    'changeEvent.resourceType',
    'changeEvent.resourceId',
    'changeEvent.eventType',
    'changeEvent.field',
    'changeEvent.previousValue',
    'changeEvent.newValue',
    'changeEvent.changedAt',
    'changeEvent.source',
    'metrics.impressions',
    'metrics.clicks',
    'metrics.spend',
    'metrics.orders',
    'metrics.sales',
    'metrics.acos',
    'metrics.cpc',
    'metrics.ctr',
    'metrics.roas',
    'metrics.cvr',
]);

const main = async () => {
    const parsed = parseArgs(process.argv.slice(2));
    const helpContext = await buildHelpContext();

    if (parsed.flags.has('version')) {
        process.stdout.write(`${helpContext.version}\n`);
        return;
    }

    if (parsed.positional.length === 0 || parsed.flags.has('help')) {
        process.stdout.write(renderHelp(resolveHelpTopicKey(parsed.positional), helpContext));
        return;
    }

    const [command, subcommand, ...rest] = parsed.positional;
    switch (command) {
        case 'auth':
            await handleAuthCommand(subcommand, rest, parsed.flags);
            return;
        case 'config':
            await handleConfigCommand(subcommand, rest);
            return;
        case 'advertiser-accounts':
            await handleAdvertiserAccountsCommand(subcommand, rest, parsed.flags);
            return;
        case 'search':
            await handleSearchCommand(subcommand, parsed.flags);
            return;
        case 'performance':
            await handlePerformanceCommand(subcommand, rest, parsed.flags);
            return;
        case 'create':
            await handleCreateCommand(subcommand, parsed.flags);
            return;
        case 'update':
            await handleUpdateCommand(subcommand, parsed.flags);
            return;
        case 'changelog':
            await handleChangelogCommand(subcommand, parsed.flags);
            return;
        default:
            throw invalidInput(`Unknown command: ${command}.`, { command });
    }
};

type FlagMap = Map<string, string[]>;

type ParsedArgs = {
    positional: string[];
    flags: FlagMap;
};

type CliConfig = {
    storageDir: string;
    configPath: string;
    baseUrl?: string;
};

type StoredConfig = {
    baseUrl?: string;
};

type FlagKind = 'string' | 'number' | 'json';

type OperationErrorShape = {
    operationCode?: string;
    code?: string;
    message?: string;
    details?: unknown;
};

type CliContractErrorShape = {
    code: string;
    message: string;
    details: unknown;
};

class CliContractError extends Error {
    readonly code: string;
    readonly details: unknown;

    constructor(input: CliContractErrorShape) {
        super(input.message);
        this.name = 'CliContractError';
        this.code = input.code;
        this.details = input.details;
    }
}

const handleAdvertiserAccountsCommand = async (subcommand: string | undefined, rest: string[], flags: FlagMap) => {
    assertNoUnexpectedFlags(flags, ['help']);
    if (subcommand !== 'list' || rest.length > 0) {
        throw invalidInput('Use `bb advertiser-accounts list`.', { command: 'advertiser-accounts' });
    }
    const client = await createApiClient();
    printOutput(await client.list_advertiser_accounts.query({}));
};

const handleSearchCommand = async (resource: string | undefined, flags: FlagMap) => {
    if (!resource) {
        throw invalidInput('Missing search resource.', { expected: ['campaign', 'ad-group', 'ad', 'target', 'product', 'change-event'] });
    }
    const allowedFlags = ['account', 'fields', 'where', 'start-date', 'end-date', 'order-by', 'limit', 'cursor', 'all', 'help'];
    assertNoUnexpectedFlags(flags, allowedFlags);
    const accountId = requireAccount(flags);
    const input = buildSearchInput(resource, accountId, flags);
    const client = await createApiClient();
    const result = flags.has('all') ? await fetchAllSearchPages(client, input) : await client.search.query(input);
    printOutput(result);
};

const handlePerformanceCommand = async (subcommand: string | undefined, rest: string[], flags: FlagMap) => {
    if (subcommand || rest.length > 0) {
        throw invalidInput('Use `bb performance` without a subcommand.', {});
    }
    assertNoUnexpectedFlags(flags, ['account', 'dimension', 'entity-ids', 'interval', 'metrics', 'start-date', 'end-date', 'json', 'help']);
    const accountId = requireAccount(flags);
    const json = await readJsonFlag(flags);
    const flagInput: Record<string, unknown> = { accountId };
    for (const key of ['dimension', 'interval'] as const) {
        const value = readOptionalFlag(flags, key);
        if (value !== undefined) {
            flagInput[key] = value.replaceAll('-', '_');
        }
    }
    for (const [flag, property] of [
        ['metrics', 'metrics'],
        ['entity-ids', 'entityIds'],
    ] as const) {
        const value = readOptionalFlag(flags, flag);
        if (value !== undefined) {
            flagInput[property] = splitList(value, flag);
        }
    }
    const startDate = readOptionalFlag(flags, 'start-date');
    const endDate = readOptionalFlag(flags, 'end-date');
    if ((startDate && !endDate) || (!startDate && endDate)) {
        throw invalidInput('`--start-date` and `--end-date` must be supplied together.', {});
    }
    if (startDate && endDate) {
        flagInput.dateRange = { startDate, endDate };
    }
    const input = mergeTopLevelInput(json ?? {}, flagInput, 'performance');
    const client = (await createApiClient()) as BidBeaconClient & { performance: { query: (value: unknown) => Promise<unknown> } };
    printOutput(await client.performance.query(input));
};

const handleCreateCommand = async (operation: string | undefined, flags: FlagMap) => {
    if (!operation) {
        throw invalidInput('Missing create operation.', { expected: CREATE_OPERATION_NAMES });
    }
    const definition = CREATE_DEFINITIONS[operation];
    if (!definition) {
        throw invalidInput(`Unknown create operation: ${operation}.`, { operation, expected: CREATE_OPERATION_NAMES });
    }
    const allowedFlags = ['account', 'json', 'help', ...Object.keys(definition.flags)];
    assertNoUnexpectedFlags(flags, allowedFlags);
    const accountId = requireAccount(flags);
    const json = await readJsonFlag(flags, { required: definition.jsonRequired });

    if (definition.composite) {
        if (!json) {
            throw invalidInput('Composite creation requires `--json <object|@file|->`.', { operation });
        }
        const input = mergeAccount(json, accountId, operation);
        printOutput(await callCreateOperation(await createApiClient(), operation, input));
        return;
    }

    const flagInput = readTypedFlags(flags, definition.flags);
    const input = mergeTopLevelInput(json ?? {}, { accountId, ...flagInput }, operation);
    printOutput(await callCreateOperation(await createApiClient(), operation, input));
};

const handleUpdateCommand = async (resource: string | undefined, flags: FlagMap) => {
    if (!resource) {
        throw invalidInput('Missing update resource.', { expected: UPDATE_RESOURCE_NAMES });
    }
    const definition = UPDATE_DEFINITIONS[resource];
    if (!definition) {
        throw invalidInput(`Unknown update resource: ${resource}.`, { resource, expected: UPDATE_RESOURCE_NAMES });
    }
    const allowedFlags = ['account', 'json', 'help', definition.idFlag, ...Object.keys(definition.changes)];
    assertNoUnexpectedFlags(flags, allowedFlags);
    const accountId = requireAccount(flags);
    const json = await readJsonFlag(flags);
    const id = readOptionalFlag(flags, definition.idFlag);
    const changes = readTypedFlags(flags, definition.changes);
    const input = mergeUpdateInput(json ?? {}, { accountId, ...(id === undefined ? {} : { [definition.idProperty]: id }) }, changes, definition, resource);
    printOutput(await callUpdateOperation(await createApiClient(), definition.operation, input));
};

const handleAuthCommand = async (subcommand: string | undefined, rest: string[], flags: FlagMap) => {
    assertNoUnexpectedFlags(flags, ['stdin', 'json', 'help']);
    if (subcommand === 'set') {
        if (rest.length > 1) {
            throw invalidInput('Use `bb auth set [ak_...]` or `bb auth set --stdin`.', {});
        }
        const value = flags.has('stdin') ? await readStdin() : rest[0];
        if (!value) {
            throw invalidInput('Missing API key. Use `bb auth set [ak_...]` or `bb auth set --stdin`.', {});
        }
        const auth = setStoredApiKey(value);
        printOutput({ source: auth.source, envOverride: auth.envOverride });
        return;
    }
    if (subcommand === 'clear' && rest.length === 0) {
        const result = clearStoredApiKey();
        printOutput({ cleared: result.cleared, source: result.auth.source, envOverride: result.auth.envOverride });
        return;
    }
    if (subcommand === 'status' && rest.length === 0) {
        const auth = loadAuthState();
        printOutput({ source: auth.source, envOverride: auth.envOverride, secureStore: auth.secureStore });
        return;
    }
    throw invalidInput('Use `bb auth set`, `bb auth clear`, or `bb auth status`.', {});
};

const handleConfigCommand = async (subcommand: string | undefined, rest: string[]) => {
    const config = await loadConfig();
    if (!subcommand || subcommand === 'show') {
        if (rest.length > 0) {
            throw invalidInput('Use `bb config show` without additional arguments.', {});
        }
        printOutput({ storageDir: config.storageDir, configPath: config.configPath, config: configToOutput(config) });
        return;
    }
    if (subcommand === 'get') {
        const key = requireConfigKey(rest[0]);
        if (rest.length > 1) {
            throw invalidInput('`bb config get` accepts one key.', { key });
        }
        printOutput({ key, value: key === 'base-url' ? config.baseUrl : config.storageDir });
        return;
    }
    if (subcommand === 'set') {
        const key = requireConfigKey(rest[0]);
        const value = rest[1]?.trim();
        if (!value || rest.length > 2) {
            throw invalidInput('`bb config set` requires one key and one value.', { key });
        }
        if (key === 'storage-dir') {
            const baseUrl = config.baseUrl;
            await writeJson(DEFAULT_SETTINGS_PATH, { storageDir: value });
            const nextConfig = await loadConfig();
            await saveStoredConfig(nextConfig, { baseUrl });
        } else {
            await saveStoredConfig(config, { baseUrl: normalizeApiBaseUrl(value) });
        }
        printOutput({ key, value: key === 'storage-dir' ? value : normalizeApiBaseUrl(value) });
        return;
    }
    if (subcommand === 'unset') {
        const key = requireConfigKey(rest[0]);
        if (rest.length > 1) {
            throw invalidInput('`bb config unset` accepts one key.', { key });
        }
        if (key === 'storage-dir') {
            await rm(DEFAULT_SETTINGS_PATH, { force: true });
        } else {
            const stored = await readStoredConfig(config.configPath);
            stored.baseUrl = undefined;
            await writeJson(config.configPath, stored);
        }
        printOutput({ key, unset: true });
        return;
    }
    if (subcommand === 'reset' && rest.length === 0) {
        await rm(config.configPath, { force: true });
        await rm(DEFAULT_SETTINGS_PATH, { force: true });
        printOutput({ reset: true });
        return;
    }
    throw invalidInput('Use `bb config show|get|set|unset|reset`.', {});
};

const handleChangelogCommand = async (version: string | undefined, flags: FlagMap) => {
    assertNoUnexpectedFlags(flags, ['all', 'help']);
    const changelog = await readChangelog();
    if (flags.has('all')) {
        printOutput({ currentVersion: changelog.currentVersion, changelog: changelog.raw });
        return;
    }
    const selectedVersion = normalizeVersion(version ?? changelog.currentVersion);
    const entry = changelog.entries.find(candidate => candidate.version === selectedVersion);
    if (!entry) {
        throw invalidInput(`Changelog entry not found for version ${selectedVersion}.`, { version: selectedVersion });
    }
    printOutput({ currentVersion: changelog.currentVersion, selectedVersion, entry });
};

const callCreateOperation = async (client: BidBeaconClient, operation: string, input: unknown) => {
    switch (operation) {
        case 'sponsored-products-campaign':
            return client.create_sponsored_products_campaign.mutate(input as RouterInputs['create_sponsored_products_campaign']);
        case 'campaign':
            return client.create_campaign.mutate(input as RouterInputs['create_campaign']);
        case 'ad-group':
            return client.create_ad_group.mutate(input as RouterInputs['create_ad_group']);
        case 'ad':
            return client.create_ad.mutate(input as RouterInputs['create_ad']);
        case 'keyword-target':
            return client.create_keyword_target.mutate(input as RouterInputs['create_keyword_target']);
        case 'product-target':
            return client.create_product_target.mutate(input as RouterInputs['create_product_target']);
        case 'negative-keyword':
            return client.create_negative_keyword.mutate(input as RouterInputs['create_negative_keyword']);
        case 'negative-product-target':
            return client.create_negative_product_target.mutate(input as RouterInputs['create_negative_product_target']);
        default:
            throw invalidInput(`Unknown create operation: ${operation}.`, { operation });
    }
};

const callUpdateOperation = async (client: BidBeaconClient, operation: string, input: unknown) => {
    switch (operation) {
        case 'update_campaign':
            return client.update_campaign.mutate(input as RouterInputs['update_campaign']);
        case 'update_ad_group':
            return client.update_ad_group.mutate(input as RouterInputs['update_ad_group']);
        case 'update_ad':
            return client.update_ad.mutate(input as RouterInputs['update_ad']);
        case 'update_target':
            return client.update_target.mutate(input as RouterInputs['update_target']);
        default:
            throw invalidInput(`Unknown update operation: ${operation}.`, { operation });
    }
};

const fetchAllSearchPages = async (client: BidBeaconClient, input: RouterInputs['search']) => {
    const rows: unknown[] = [];
    let pageInput = input;
    const seenCursors = new Set<string>();

    while (true) {
        const page = await client.search.query(pageInput);
        rows.push(...page.rows);
        if (!page.nextCursor) {
            return rows;
        }
        if (seenCursors.has(page.nextCursor)) {
            throw new CliContractError({ code: 'CURSOR_INVALID', message: 'Search returned a repeated cursor.', details: { cursor: page.nextCursor } });
        }
        seenCursors.add(page.nextCursor);
        pageInput = { ...pageInput, cursor: page.nextCursor };
    }
};

const buildSearchInput = (rawResource: string, accountId: string, flags: FlagMap): RouterInputs['search'] => {
    const resource = toSearchResource(rawResource);
    const input: Record<string, unknown> = { accountId, resource };
    const fields = readOptionalFlag(flags, 'fields');
    if (fields !== undefined) {
        input.fields = splitList(fields, 'fields');
        validateSearchFields(input.fields as string[]);
    }
    const where = flags.get('where') ?? [];
    if (where.length > 0) {
        input.filters = where.map(parseWhereExpression);
        validateSearchFields((input.filters as Array<{ field: string }>).map(filter => filter.field));
    }
    const startDate = readOptionalFlag(flags, 'start-date');
    const endDate = readOptionalFlag(flags, 'end-date');
    if ((startDate && !endDate) || (!startDate && endDate)) {
        throw invalidInput('`--start-date` and `--end-date` must be supplied together.', {});
    }
    if (startDate && endDate) {
        input.dateRange = { startDate, endDate };
    }
    const orderBy = readOptionalFlag(flags, 'order-by');
    if (orderBy !== undefined) {
        input.orderBy = parseOrderBy(orderBy);
        validateSearchFields((input.orderBy as Array<{ field: string }>).map(order => order.field));
    }
    const limit = readOptionalFlag(flags, 'limit');
    if (limit !== undefined) {
        input.limit = parseBoundedInt(limit, 'limit', 1, 200);
    }
    const cursor = readOptionalFlag(flags, 'cursor');
    if (cursor !== undefined) {
        input.cursor = cursor;
    }
    return input as RouterInputs['search'];
};

const mergeAccount = (json: Record<string, unknown>, accountId: string, operation: string) => {
    if (Object.hasOwn(json, 'accountId')) {
        throw duplicateInput('accountId', operation);
    }
    return { ...json, accountId };
};

const mergeTopLevelInput = (json: Record<string, unknown>, flags: Record<string, unknown>, operation: string) => {
    for (const key of Object.keys(flags)) {
        if (Object.hasOwn(json, key)) {
            throw duplicateInput(key, operation);
        }
    }
    return { ...json, ...flags };
};

const mergeUpdateInput = (json: Record<string, unknown>, topLevelFlags: Record<string, unknown>, changeFlags: Record<string, unknown>, definition: UpdateDefinition, resource: string) => {
    if (Object.hasOwn(json, 'accountId')) {
        throw duplicateInput('accountId', resource);
    }
    if (Object.hasOwn(json, definition.idProperty) && Object.hasOwn(topLevelFlags, definition.idProperty)) {
        throw duplicateInput(definition.idProperty, resource);
    }
    const jsonChanges = json.changes;
    if (jsonChanges !== undefined && (!jsonChanges || typeof jsonChanges !== 'object' || Array.isArray(jsonChanges))) {
        throw invalidInput('`changes` in --json must be an object.', { property: 'changes' });
    }
    const changes = { ...((jsonChanges ?? {}) as Record<string, unknown>) };
    for (const [key, value] of Object.entries(changeFlags)) {
        if (Object.hasOwn(changes, key)) {
            throw duplicateInput(`changes.${key}`, resource);
        }
        changes[key] = value;
    }
    if (Object.keys(changes).length === 0) {
        throw invalidInput('An update requires at least one change flag or a non-empty `changes` object in --json.', { resource });
    }
    const input = { ...json, ...topLevelFlags, changes };
    if (!(typeof input[definition.idProperty] === 'string' && input[definition.idProperty])) {
        throw invalidInput(`Missing required ${definition.idProperty}.`, { resource, property: definition.idProperty });
    }
    return input;
};

const readTypedFlags = (flags: FlagMap, definition: Record<string, FlagKind>) => {
    const values: Record<string, unknown> = {};
    for (const [flag, kind] of Object.entries(definition)) {
        const raw = readOptionalFlag(flags, flag);
        if (raw === undefined) {
            continue;
        }
        values[camelCase(flag)] = parseFlagValue(raw, kind, flag);
    }
    return values;
};

const readJsonFlag = async (flags: FlagMap, options: { required?: boolean } = {}): Promise<Record<string, unknown> | undefined> => {
    const raw = readOptionalFlag(flags, 'json');
    if (raw === undefined) {
        if (options.required) {
            throw invalidInput('Missing required `--json <object|@file|->`.', {});
        }
        return undefined;
    }
    let source = raw;
    if (raw === '-') {
        source = await readStdin();
    } else if (raw.startsWith('@')) {
        const path = raw.slice(1).trim();
        if (!path) {
            throw invalidInput('`--json @file` requires a file path.', {});
        }
        source = await readFile(path, 'utf8');
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(source);
    } catch {
        throw invalidInput('`--json` must contain valid JSON.', {});
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw invalidInput('`--json` must contain a JSON object.', {});
    }
    return parsed as Record<string, unknown>;
};

const parseWhereExpression = (raw: string) => {
    const trimmed = raw.trim();
    const match = WHERE_WORD_EXPRESSION_REGEX.exec(trimmed) ?? WHERE_SYMBOL_EXPRESSION_REGEX.exec(trimmed);
    if (!match?.groups) {
        throw invalidInput(`Unsupported --where expression: ${raw}.`, { expression: raw });
    }
    const field = match.groups.field;
    const operator = match.groups.operator.toLowerCase();
    const valueText = match.groups.value.trim();
    if (operator === 'contains') {
        const value = parseJsonValue(valueText, raw);
        if (typeof value !== 'string') {
            throw invalidInput('`contains` requires a string value.', { expression: raw });
        }
        return { field, operator: 'contains' as const, value };
    }
    if (operator === 'in') {
        const value = parseJsonValue(valueText, raw);
        if (!Array.isArray(value) || value.length === 0) {
            throw invalidInput('`in` requires a non-empty JSON array.', { expression: raw });
        }
        return { field, operator: 'in' as const, value };
    }
    const value = parseJsonValue(valueText, raw);
    const mappedOperator = { '=': 'eq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[operator];
    if (!mappedOperator) {
        throw invalidInput(`Unsupported --where operator: ${operator}.`, { expression: raw });
    }
    if (mappedOperator !== 'eq' && (Array.isArray(value) || (value !== null && typeof value === 'object'))) {
        throw invalidInput('Ordered comparison filters require a scalar value.', { expression: raw });
    }
    return { field, operator: mappedOperator as 'eq' | 'gt' | 'gte' | 'lt' | 'lte', value };
};

const parseJsonValue = (raw: string, expression: string) => {
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        if (FILTER_TOKEN_REGEX.test(raw)) {
            return raw;
        }
        throw invalidInput(`Filter value must be JSON or an unquoted simple token: ${expression}.`, { expression });
    }
};

const parseOrderBy = (raw: string) => {
    const values = splitList(raw, 'order-by');
    return values.map(value => {
        const [field, direction, ...extra] = value.split(':');
        if (!(field && direction) || extra.length > 0 || (direction !== 'asc' && direction !== 'desc')) {
            throw invalidInput(`Invalid order-by value: ${value}. Use field:asc or field:desc.`, { value });
        }
        return { field, direction };
    });
};

const splitList = (raw: string, label: string) => {
    const values = raw
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    if (values.length === 0) {
        throw invalidInput(`--${label} requires at least one value.`, {});
    }
    if (new Set(values).size !== values.length) {
        throw invalidInput(`--${label} values must be unique.`, { values });
    }
    return values;
};

const validateSearchFields = (fields: string[]) => {
    const unsupported = fields.filter(field => !SEARCH_FIELD_NAMES.has(field));
    if (unsupported.length > 0) {
        throw invalidInput(`Unsupported Search Field: ${unsupported[0]}.`, { field: unsupported[0] });
    }
};

const parseFlagValue = (raw: string, kind: FlagKind, flag: string) => {
    if (kind === 'number') {
        const value = Number(raw);
        if (!Number.isFinite(value)) {
            throw invalidInput(`--${flag} requires a finite number.`, { flag });
        }
        return value;
    }
    if (kind === 'json') {
        try {
            const value = JSON.parse(raw) as unknown;
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error('not object');
            }
            return value;
        } catch {
            throw invalidInput(`--${flag} requires a JSON object.`, { flag });
        }
    }
    return raw === 'null' && (flag === 'end-date' || flag === 'placement-bid-adjustments') ? null : raw;
};

const parseArgs = (args: string[]): ParsedArgs => {
    const positional: string[] = [];
    const flags: FlagMap = new Map();
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '-h' || arg === '--help') {
            addFlag(flags, 'help', 'true');
            continue;
        }
        if (arg === '--version') {
            addFlag(flags, 'version', 'true');
            continue;
        }
        if (arg.startsWith('--')) {
            const separator = arg.indexOf('=');
            const rawName = separator >= 0 ? arg.slice(2, separator) : arg.slice(2);
            if (!rawName) {
                throw invalidInput('Flag name cannot be empty.', {});
            }
            const inlineValue = separator >= 0 ? arg.slice(separator + 1) : undefined;
            const value = inlineValue ?? (args[index + 1] && !args[index + 1].startsWith('--') ? args[++index] : 'true');
            addFlag(flags, rawName, value);
            continue;
        }
        positional.push(arg);
    }
    return { positional, flags };
};

const addFlag = (flags: FlagMap, name: string, value: string) => {
    const values = flags.get(name) ?? [];
    values.push(value);
    flags.set(name, values);
};

const assertNoUnexpectedFlags = (flags: FlagMap, allowed: string[]) => {
    const allowedSet = new Set(allowed);
    const unexpected = [...flags.keys()].filter(name => !allowedSet.has(name));
    if (unexpected.length > 0) {
        throw invalidInput(`Unsupported flag: --${unexpected[0]}.`, { flag: unexpected[0] });
    }
};

const readRequiredFlag = (flags: FlagMap, name: string) => {
    const value = readOptionalFlag(flags, name);
    if (value === undefined || value === 'true') {
        throw invalidInput(`Missing required --${name}.`, { flag: name });
    }
    return value;
};

const readOptionalFlag = (flags: FlagMap, name: string) => {
    const values = flags.get(name);
    if (!values) {
        return undefined;
    }
    if (values.length !== 1) {
        throw invalidInput(`--${name} may only be supplied once.`, { flag: name });
    }
    const value = values[0];
    if (value === 'true' && name !== 'all' && name !== 'help' && name !== 'version' && name !== 'stdin') {
        throw invalidInput(`--${name} requires a value.`, { flag: name });
    }
    return value;
};

const requireAccount = (flags: FlagMap) => {
    const accountId = readRequiredFlag(flags, 'account');
    if (!UUID_REGEX.test(accountId)) {
        throw invalidInput('--account must be an advertiser account UUID.', { accountId });
    }
    return accountId;
};

const duplicateInput = (property: string, operation: string) => invalidInput(`Property ${property} was assigned by both --json and a flag.`, { operation, property });

const invalidInput = (message: string, details: unknown) => new CliContractError({ code: 'INVALID_INPUT', message, details });

const toSearchResource = (resource: string) => {
    const normalized = SEARCH_RESOURCE_BY_COMMAND[resource as keyof typeof SEARCH_RESOURCE_BY_COMMAND];
    if (!normalized) {
        throw invalidInput(`Unknown search resource: ${resource}.`, { resource, expected: Object.keys(SEARCH_RESOURCE_BY_COMMAND) });
    }
    return normalized as RouterInputs['search']['resource'];
};

const parseBoundedInt = (raw: string, label: string, minimum: number, maximum: number) => {
    if (!INTEGER_REGEX.test(raw)) {
        throw invalidInput(`--${label} requires an integer.`, { flag: label });
    }
    const value = Number(raw);
    if (value < minimum || value > maximum) {
        throw invalidInput(`--${label} must be between ${minimum} and ${maximum}.`, { flag: label, minimum, maximum });
    }
    return value;
};

const camelCase = (value: string) => value.replace(/-([a-z])/g, (_, character: string) => character.toUpperCase());

const createApiClient = async () => {
    const config = await loadConfig();
    const auth = loadAuthState();
    if (!auth.apiKey) {
        throw new CliContractError({ code: 'AUTHENTICATION_REQUIRED', message: getMissingApiKeyMessage(), details: {} });
    }
    return createBidBeaconClient({ baseUrl: config.baseUrl ?? DEFAULT_BASE_URL, credential: auth.apiKey });
};

const loadConfig = async (): Promise<CliConfig> => {
    const storageDir = await resolveStorageDir();
    const configPath = join(storageDir, CONFIG_FILENAME);
    const stored = await readStoredConfig(configPath);
    const envBaseUrl = process.env[BASE_URL_ENV_VAR]?.trim();
    return {
        storageDir,
        configPath,
        baseUrl: envBaseUrl ? normalizeApiBaseUrl(envBaseUrl) : stored.baseUrl,
    };
};

const resolveStorageDir = async () => {
    const envStorageDir = process.env[STORAGE_DIR_ENV_VAR]?.trim();
    if (envStorageDir) {
        return envStorageDir;
    }
    try {
        const settings = JSON.parse(await readFile(DEFAULT_SETTINGS_PATH, 'utf8')) as { storageDir?: unknown };
        if (typeof settings.storageDir === 'string' && settings.storageDir.trim()) {
            return settings.storageDir;
        }
    } catch {
        // Missing or malformed local settings fall back to the default storage directory.
    }
    return DEFAULT_STORAGE_DIR;
};

const readStoredConfig = async (path: string): Promise<StoredConfig> => {
    try {
        const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
        return typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim() ? { baseUrl: normalizeApiBaseUrl(parsed.baseUrl) } : {};
    } catch {
        return {};
    }
};

const saveStoredConfig = async (config: CliConfig, values: StoredConfig) => {
    await mkdir(config.storageDir, { recursive: true });
    await writeJson(config.configPath, values);
};

const writeJson = async (path: string, value: unknown) => {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const configToOutput = (config: CliConfig) => (config.baseUrl ? { baseUrl: config.baseUrl } : {});

const requireConfigKey = (value: string | undefined): 'base-url' | 'storage-dir' => {
    if (value === 'base-url' || value === 'storage-dir') {
        return value;
    }
    throw invalidInput('Config key must be `base-url` or `storage-dir`.', { key: value });
};

const buildHelpContext = async () => {
    const packageJson = await readPackageJson();
    const config = await loadConfig();
    const auth = loadAuthState();
    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    return {
        version: packageJson.version ?? '0.0.0',
        configSummary: `config: ${auth.apiKey ? 'api-key configured' : 'api-key missing'}, base-url ${baseUrl}`,
    };
};

const readPackageJson = async () => {
    for (const packageUrl of [new URL('../package.json', import.meta.url), new URL('../../package.json', import.meta.url), new URL('../../../package.json', import.meta.url)]) {
        try {
            return JSON.parse(await readFile(packageUrl, 'utf8')) as { version?: string };
        } catch {
            // Bundled test artifacts may live deeper than the package dist directory.
        }
    }
    return { version: '0.0.0' };
};

const readStdin = async () => readFile(0, 'utf8');

const printOutput = (value: unknown) => {
    process.stdout.write(`${JSON.stringify(value)}\n`);
};

const normalizeError = (error: unknown): CliContractErrorShape => {
    if (error instanceof CliContractError) {
        return { code: error.code, message: error.message, details: error.details };
    }
    const candidate = error as {
        message?: string;
        data?: OperationErrorShape;
        shape?: { data?: OperationErrorShape };
    };
    const operationError = candidate.shape?.data ?? candidate.data;
    const operationCode = operationError?.operationCode;
    if (operationCode) {
        return {
            code: operationCode,
            message: withTransportHint(operationError.message ?? candidate.message ?? 'Request failed.'),
            details: operationError.details ?? {},
        };
    }
    const trpcCode = (candidate.data as { code?: string } | undefined)?.code;
    const mappedCode = trpcCode ? TRPC_ERROR_TO_OPERATION_CODE[trpcCode] : undefined;
    return {
        code: mappedCode ?? 'INTERNAL_ERROR',
        message: withTransportHint(candidate.message ?? 'Request failed.'),
        details: {},
    };
};

const normalizeVersion = (value: string) => value.replace(VERSION_PREFIX_REGEX, '');

const readChangelog = async () => {
    let raw: string | undefined;
    for (const source of CHANGELOG_SOURCES) {
        try {
            raw = await readFile(source, 'utf8');
            break;
        } catch {
            // Installed packages and source checkouts place the changelog at different depths.
        }
    }
    if (!raw) {
        throw new CliContractError({ code: 'INTERNAL_ERROR', message: 'The packaged BidBeacon changelog is unavailable.', details: {} });
    }
    const entries: ChangelogEntry[] = [];
    let current: ChangelogEntry | undefined;
    let currentSection: ChangelogSection | undefined;
    for (const line of raw.split(CHANGELOG_LINES_REGEX)) {
        const header = CHANGELOG_ENTRY_REGEX.exec(line);
        if (header) {
            current = { version: header[1], date: header[2], sections: [] };
            entries.push(current);
            currentSection = undefined;
            continue;
        }
        const section = CHANGELOG_SECTION_REGEX.exec(line);
        if (section && current) {
            currentSection = { title: section[1], changes: [] };
            current.sections.push(currentSection);
            continue;
        }
        if (currentSection && CHANGELOG_BULLET_REGEX.test(line)) {
            currentSection.changes.push(line.replace(CHANGELOG_BULLET_REGEX, ''));
        }
    }
    const currentVersion = entries[0]?.version ?? '0.0.0';
    return { currentVersion, entries, raw };
};

type ChangelogSection = { title: string; changes: string[] };
type ChangelogEntry = { version: string; date: string; sections: ChangelogSection[] };

const CREATE_OPERATION_NAMES = ['sponsored-products-campaign', 'campaign', 'ad-group', 'ad', 'keyword-target', 'product-target', 'negative-keyword', 'negative-product-target'] as const;

const SEARCH_RESOURCE_BY_COMMAND = {
    campaign: 'campaign',
    'ad-group': 'ad_group',
    ad: 'ad',
    target: 'target',
    product: 'product',
    'change-event': 'change_event',
} as const;
const UPDATE_RESOURCE_NAMES = ['campaign', 'ad-group', 'ad', 'target'] as const;

const CREATE_DEFINITIONS: Record<string, { composite?: boolean; jsonRequired?: boolean; flags: Record<string, FlagKind> }> = {
    'sponsored-products-campaign': { composite: true, jsonRequired: true, flags: {} },
    campaign: {
        flags: {
            name: 'string',
            state: 'string',
            'daily-budget': 'number',
            'bid-strategy': 'string',
            'targeting-mode': 'string',
            'start-date': 'string',
            'end-date': 'string',
            'placement-bid-adjustments': 'json',
        },
    },
    'ad-group': { flags: { 'campaign-id': 'string', name: 'string', state: 'string', 'default-bid': 'number' } },
    ad: { flags: { 'ad-group-id': 'string', asin: 'string', state: 'string' } },
    'keyword-target': { flags: { 'ad-group-id': 'string', keyword: 'string', 'match-type': 'string', bid: 'number', state: 'string' } },
    'product-target': { flags: { 'ad-group-id': 'string', asin: 'string', bid: 'number', state: 'string' } },
    'negative-keyword': { flags: { 'campaign-id': 'string', 'ad-group-id': 'string', keyword: 'string', 'match-type': 'string', state: 'string' } },
    'negative-product-target': { flags: { 'campaign-id': 'string', 'ad-group-id': 'string', asin: 'string', state: 'string' } },
};

type UpdateDefinition = {
    operation: 'update_campaign' | 'update_ad_group' | 'update_ad' | 'update_target';
    idFlag: string;
    idProperty: string;
    changes: Record<string, FlagKind>;
};

const UPDATE_DEFINITIONS: Record<string, UpdateDefinition> = {
    campaign: {
        operation: 'update_campaign',
        idFlag: 'campaign-id',
        idProperty: 'campaignId',
        changes: { state: 'string', 'daily-budget': 'number', 'bid-strategy': 'string', 'placement-bid-adjustments': 'json' },
    },
    'ad-group': { operation: 'update_ad_group', idFlag: 'ad-group-id', idProperty: 'adGroupId', changes: { state: 'string', 'default-bid': 'number' } },
    ad: { operation: 'update_ad', idFlag: 'ad-id', idProperty: 'adId', changes: { state: 'string' } },
    target: { operation: 'update_target', idFlag: 'target-id', idProperty: 'targetId', changes: { state: 'string', bid: 'number' } },
};

const TRPC_ERROR_TO_OPERATION_CODE: Record<string, string> = {
    UNAUTHORIZED: 'AUTHENTICATION_REQUIRED',
    FORBIDDEN: 'ACCOUNT_ACCESS_DENIED',
    BAD_REQUEST: 'INVALID_INPUT',
    NOT_FOUND: 'RESOURCE_NOT_FOUND',
    CONFLICT: 'COMPOSITE_PARTIAL_FAILURE',
    TIMEOUT: 'AMAZON_UNAVAILABLE',
};

main().catch(error => {
    const normalized = normalizeError(error);
    process.stderr.write(`${JSON.stringify({ error: normalized })}\n`);
    process.exitCode = 1;
});
