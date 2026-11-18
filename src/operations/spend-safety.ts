import { AsyncLocalStorage } from 'node:async_hooks';
import { OperationError } from './operation-errors';
import type { PlacementBidAdjustments } from './placement-bid-adjustments';

export type SpendSafetyPolicy = {
    maxBid: number;
    maxDailyBudget: number;
    maxWritesPerHour: number;
};

const WRITE_WINDOW_MS = 60 * 60 * 1000;

const spendWriteStore = new AsyncLocalStorage<{ accounted: true }>();
const processLocalWriteTimestampsByAccount = new Map<string, number[]>();

let cachedPolicy: SpendSafetyPolicy | undefined;

export const getSpendSafetyPolicy = (env: NodeJS.ProcessEnv = process.env): SpendSafetyPolicy => {
    if (env === process.env && cachedPolicy) {
        return cachedPolicy;
    }

    const policy = {
        maxBid: parsePositiveNumber(env.BIDBEACON_MAX_BID as string | number | undefined, 'BIDBEACON_MAX_BID'),
        maxDailyBudget: parsePositiveNumber(env.BIDBEACON_MAX_DAILY_BUDGET as string | number | undefined, 'BIDBEACON_MAX_DAILY_BUDGET'),
        maxWritesPerHour: parsePositiveInteger(env.BIDBEACON_MAX_WRITES_PER_HOUR as string | number | undefined, 'BIDBEACON_MAX_WRITES_PER_HOUR'),
    };

    if (env === process.env) {
        cachedPolicy = policy;
    }

    return policy;
};

export const assertSpendSafetyConfigured = (env: NodeJS.ProcessEnv = process.env): SpendSafetyPolicy => getSpendSafetyPolicy(env);

export const assertBidCeiling = (value: number, field: string, policy: SpendSafetyPolicy = getSpendSafetyPolicy()): void => {
    if (value <= policy.maxBid) {
        return;
    }

    throw new OperationError(
        'INVALID_INPUT',
        `Requested ${field} ${formatMoney(value)} exceeds the BidBeacon max bid of ${formatMoney(policy.maxBid)}. A human must raise BIDBEACON_MAX_BID or choose a lower ${field}.`,
        {
            field,
            requested: value,
            max: policy.maxBid,
            suggestions: [`Lower ${field} to ${formatMoney(policy.maxBid)} or below.`, 'Ask a human to raise BIDBEACON_MAX_BID if this spend is intentional.'],
        }
    );
};

export const assertDailyBudgetCeiling = (value: number, policy: SpendSafetyPolicy = getSpendSafetyPolicy()): void => {
    if (value <= policy.maxDailyBudget) {
        return;
    }

    throw new OperationError(
        'INVALID_INPUT',
        `Requested dailyBudget ${formatMoney(value)} exceeds the BidBeacon max daily budget of ${formatMoney(policy.maxDailyBudget)}. A human must raise BIDBEACON_MAX_DAILY_BUDGET or choose a lower dailyBudget.`,
        {
            field: 'dailyBudget',
            requested: value,
            max: policy.maxDailyBudget,
            suggestions: [`Lower dailyBudget to ${formatMoney(policy.maxDailyBudget)} or below.`, 'Ask a human to raise BIDBEACON_MAX_DAILY_BUDGET if this spend is intentional.'],
        }
    );
};

export const assertBidStrategyCeiling = (bidStrategy: string | null | undefined, policy: SpendSafetyPolicy = getSpendSafetyPolicy()): void => {
    if (!bidStrategy || normalizeBidStrategy(bidStrategy) !== 'DYNAMIC_UP_AND_DOWN') {
        return;
    }

    throw dynamicUpAndDownError(bidStrategy, policy);
};

export const assertStoredBidStrategyAllowsSpendWrite = (bidStrategy: string | null | undefined, policy: SpendSafetyPolicy = getSpendSafetyPolicy()): void => {
    if (!bidStrategy) {
        throw new OperationError(
            'INVALID_INPUT',
            'Campaign bid strategy is not synced yet, so BidBeacon cannot verify the effective bid ceiling. Sync campaign settings or ask a human before changing bids.',
            {
                field: 'bidStrategy',
                requested: null,
                maxBid: policy.maxBid,
                suggestions: ['Sync the campaign so bidStrategy is known.', 'Ask a human to apply the bid change after strategy is verified.'],
            }
        );
    }

    const normalized = normalizeBidStrategy(bidStrategy);
    if (normalized === 'FIXED' || normalized === 'DYNAMIC_DOWN_ONLY') {
        return;
    }

    if (normalized === 'DYNAMIC_UP_AND_DOWN') {
        throw dynamicUpAndDownError(bidStrategy, policy);
    }

    throw new OperationError(
        'INVALID_INPUT',
        `Campaign bid strategy ${bidStrategy} is unrecognized, so BidBeacon cannot verify the effective bid ceiling. Sync campaign settings or ask a human before changing bids.`,
        {
            field: 'bidStrategy',
            requested: bidStrategy,
            maxBid: policy.maxBid,
            suggestions: ['Sync the campaign so bidStrategy is a known FIXED or DYNAMIC_DOWN_ONLY value.', 'Ask a human to apply the bid change after strategy is verified.'],
        }
    );
};

export const assertPlacementCeilings = (adjustments: PlacementBidAdjustments | null | undefined, referenceBids: readonly number[], policy: SpendSafetyPolicy = getSpendSafetyPolicy()): void => {
    if (referenceBids.length === 0) {
        return;
    }

    if (adjustments === null) {
        throw new OperationError(
            'INVALID_INPUT',
            'Campaign placement bid adjustments are not synced yet, so BidBeacon cannot verify the effective bid ceiling. Sync campaign settings or ask a human before changing bids.',
            {
                field: 'placementBidAdjustments',
                requested: null,
                max: policy.maxBid,
                suggestions: ['Sync the campaign so placementBidAdjustments is known.', 'Ask a human to apply the bid change after placements are verified.'],
            }
        );
    }

    if (!adjustments) {
        return;
    }

    for (const [placement, percentage] of Object.entries(adjustments)) {
        if (typeof percentage !== 'number' || percentage <= 0) {
            continue;
        }

        for (const baseBid of referenceBids) {
            const effectiveBid = baseBid * (1 + percentage / 100);
            if (effectiveBid <= policy.maxBid) {
                continue;
            }

            throw new OperationError(
                'INVALID_INPUT',
                `Placement ${placement} at ${percentage}% would raise effective bid from ${formatMoney(baseBid)} to ${formatMoney(effectiveBid)}, above the BidBeacon max bid of ${formatMoney(policy.maxBid)}. A human must approve that placement multiplier or choose a lower bid or percentage.`,
                {
                    field: `placementBidAdjustments.${placement}`,
                    requested: percentage,
                    baseBid,
                    effectiveBid,
                    max: policy.maxBid,
                    suggestions: [
                        `Lower the placement percentage or the related bid so effective bid stays at ${formatMoney(policy.maxBid)} or below.`,
                        'Ask a human if a higher effective bid is intentional.',
                    ],
                }
            );
        }
    }
};

export const withSpendWriteQuota = async <T>(accountId: string, operation: () => Promise<T>, policy: SpendSafetyPolicy = getSpendSafetyPolicy(), nowMs: number = Date.now()): Promise<T> => {
    const parent = spendWriteStore.getStore();
    if (parent) {
        return operation();
    }

    consumeSpendWriteQuota(accountId, policy, nowMs);
    return spendWriteStore.run({ accounted: true }, operation);
};

export const resetSpendWriteQuotaForTests = (): void => {
    processLocalWriteTimestampsByAccount.clear();
    cachedPolicy = undefined;
};

const consumeSpendWriteQuota = (accountId: string, policy: SpendSafetyPolicy, nowMs: number): void => {
    const windowStart = nowMs - WRITE_WINDOW_MS;
    const prior = processLocalWriteTimestampsByAccount.get(accountId) ?? [];
    const recent = prior.filter(timestamp => timestamp > windowStart);

    if (recent.length >= policy.maxWritesPerHour) {
        throw new OperationError(
            'WRITE_RATE_LIMITED',
            `This Advertiser Account exceeded the BidBeacon spend-write rate limit of ${policy.maxWritesPerHour} writes per hour. Wait before retrying, or ask a human to raise BIDBEACON_MAX_WRITES_PER_HOUR.`,
            {
                accountId,
                limit: policy.maxWritesPerHour,
                windowHours: 1,
                suggestions: ['Wait for the hourly window to free capacity.', 'Ask a human to raise BIDBEACON_MAX_WRITES_PER_HOUR if sustained write volume is intentional.'],
            }
        );
    }

    recent.push(nowMs);
    processLocalWriteTimestampsByAccount.set(accountId, recent);
};

const parsePositiveNumber = (raw: string | number | undefined, name: string): number => {
    if (raw === undefined || raw === '') {
        throw new Error(`${name} is required`);
    }

    const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a finite number greater than 0`);
    }

    return value;
};

const parsePositiveInteger = (raw: string | number | undefined, name: string): number => {
    const value = parsePositiveNumber(raw, name);
    if (!Number.isInteger(value)) {
        throw new Error(`${name} must be an integer greater than 0`);
    }

    return value;
};

const formatMoney = (value: number): string => {
    if (Number.isInteger(value)) {
        return value.toFixed(2);
    }

    return String(value);
};

const dynamicUpAndDownError = (bidStrategy: string, policy: SpendSafetyPolicy) =>
    new OperationError(
        'INVALID_INPUT',
        `Bid strategy DYNAMIC_UP_AND_DOWN can raise effective bids above the BidBeacon max bid of ${formatMoney(policy.maxBid)}. A human must approve that strategy outside BidBeacon agent writes.`,
        {
            field: 'bidStrategy',
            requested: bidStrategy,
            maxBid: policy.maxBid,
            suggestions: ['Use FIXED or DYNAMIC_DOWN_ONLY.', 'Ask a human if DYNAMIC_UP_AND_DOWN is required.'],
        }
    );

const normalizeBidStrategy = (value: string): string => {
    switch (value) {
        case 'DYNAMIC_UP_AND_DOWN':
        case 'SALES_UP_AND_DOWN':
        case 'AUTO_FOR_SALES':
        case 'SALES':
        case 'RULE_BASED':
            return 'DYNAMIC_UP_AND_DOWN';
        case 'DYNAMIC_DOWN_ONLY':
        case 'SALES_DOWN_ONLY':
        case 'LEGACY_FOR_SALES':
            return 'DYNAMIC_DOWN_ONLY';
        case 'FIXED':
        case 'MANUAL':
        case 'NONE':
            return 'FIXED';
        default:
            return value;
    }
};
