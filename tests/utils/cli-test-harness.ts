import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_LOADED_FLAG = 'BIDBEACON_TEST_ENV_LOADED';
const CLEANUP_RUN_FLAG = 'BIDBEACON_TEST_CLEANUP_RAN';
const TEST_ENTITY_PREFIX = 'bb-cli-';
const TEST_ENTITY_MAX_AGE_HOURS = 24;
const ENV_SPLIT_REGEX = /\r?\n/;
const TIMESTAMP_REGEX = /(\\d{13})/;

export const loadEnv = () => {
    if (process.env[ENV_LOADED_FLAG]) {
        return;
    }

    const envPath = resolve(process.cwd(), '.env');
    if (!existsSync(envPath)) {
        process.env[ENV_LOADED_FLAG] = 'true';
        return;
    }

    const contents = readFileSync(envPath, 'utf8');
    for (const line of contents.split(ENV_SPLIT_REGEX)) {
        const entry = parseEnvLine(line);
        if (!entry) {
            continue;
        }
        if (process.env[entry.key] === undefined) {
            process.env[entry.key] = entry.value;
        }
    }

    process.env[ENV_LOADED_FLAG] = 'true';
};

export const createCliConfig = (accountId: string) => ({
    accountId,
    range: '7d',
    timezone: 'account' as const,
});

const buildTestCaller = async (accountId: string) => {
    loadEnv();
    const { appRouter } = await import('../../src/api/router');

    const context = {
        user: { sub: 'test-user' },
        accessibleAccountIds: [accountId],
        authType: 'dev',
        request: null,
    };

    return appRouter.createCaller(context);
};

type TestCaller = Awaited<ReturnType<typeof buildTestCaller>>;

export const createTestCaller = async (accountId: string) => {
    const caller = await buildTestCaller(accountId);
    await cleanupStaleTestEntitiesOnce(caller, accountId);
    return caller;
};

const cleanupStaleTestEntitiesOnce = async (caller: TestCaller, accountId: string) => {
    if (process.env[CLEANUP_RUN_FLAG]) {
        return;
    }

    process.env[CLEANUP_RUN_FLAG] = 'true';
    await cleanupStaleTestEntities(caller, accountId);
};

const cleanupStaleTestEntities = async (caller: TestCaller, accountId: string) => {
    const config = createCliConfig(accountId);
    const cutoff = Date.now() - TEST_ENTITY_MAX_AGE_HOURS * 60 * 60 * 1000;
    const errors: string[] = [];

    const campaigns = await caller['campaigns/list']({ config });
    for (const campaign of campaigns.items) {
        if (!campaign.name.startsWith(TEST_ENTITY_PREFIX)) {
            continue;
        }
        const timestamp = extractTimestamp(campaign.name);
        if (timestamp === null || timestamp > cutoff) {
            continue;
        }

        try {
            await caller['campaigns/delete']({
                config,
                campaignId: campaign.campaignId,
            });
        } catch (error) {
            errors.push(`campaign ${campaign.campaignId}: ${formatCleanupError(error)}`);
        }
    }

    const adGroups = await caller['ad-groups/list']({ config });
    for (const adGroup of adGroups.items) {
        if (!adGroup.name.startsWith(TEST_ENTITY_PREFIX)) {
            continue;
        }
        const timestamp = extractTimestamp(adGroup.name);
        if (timestamp === null || timestamp > cutoff) {
            continue;
        }

        try {
            await caller['ad-groups/delete']({
                config,
                adGroupId: adGroup.adGroupId,
            });
        } catch (error) {
            errors.push(`ad group ${adGroup.adGroupId}: ${formatCleanupError(error)}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(`Test cleanup failed:\\n${errors.join('\\n')}`);
    }
};

const parseEnvLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
        return null;
    }

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex === -1) {
        return null;
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    const value = stripQuotes(withoutExport.slice(separatorIndex + 1).trim());
    if (!key) {
        return null;
    }

    return { key, value };
};

const stripQuotes = (value: string) => {
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
        return value.slice(1, -1);
    }
    return value;
};

const extractTimestamp = (value: string) => {
    const match = value.match(TIMESTAMP_REGEX);
    if (!match) {
        return null;
    }
    const timestamp = Number(match[1]);
    return Number.isFinite(timestamp) ? timestamp : null;
};

const formatCleanupError = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
};
