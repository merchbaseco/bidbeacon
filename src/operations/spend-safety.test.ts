import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationError } from './operation-errors';
import {
    assertBidCeiling,
    assertBidStrategyCeiling,
    assertDailyBudgetCeiling,
    assertPlacementCeilings,
    assertSpendSafetyConfigured,
    assertStoredBidStrategyAllowsSpendWrite,
    getSpendSafetyPolicy,
    resetSpendWriteQuotaForTests,
    withSpendWriteQuota,
} from './spend-safety';

const MAX_BID_REQUIRED = /BIDBEACON_MAX_BID is required/;
const GREATER_THAN_ZERO = /greater than 0/;
const INTEGER_REQUIRED = /integer/;
const HUMAN_NEEDED = /human/i;
const MAX_BID_MESSAGE = /max bid/;
const MAX_DAILY_BUDGET_MESSAGE = /max daily budget/;
const EFFECTIVE_BID_MESSAGE = /effective bid/;
const DYNAMIC_UP_AND_DOWN_MESSAGE = /DYNAMIC_UP_AND_DOWN/;

const testEnv = {
    BIDBEACON_MAX_BID: '5',
    BIDBEACON_MAX_DAILY_BUDGET: '100',
    BIDBEACON_MAX_WRITES_PER_HOUR: '3',
} as NodeJS.ProcessEnv;

afterEach(() => {
    resetSpendWriteQuotaForTests();
    vi.useRealTimers();
});

describe('spend safety policy parsing', () => {
    it('loads positive ceilings from env', () => {
        expect(getSpendSafetyPolicy(testEnv)).toEqual({
            maxBid: 5,
            maxDailyBudget: 100,
            maxWritesPerHour: 3,
        });
    });

    it('refuses missing or non-positive env at startup validation', () => {
        expect(() => assertSpendSafetyConfigured({} as NodeJS.ProcessEnv)).toThrow(MAX_BID_REQUIRED);
        expect(() => assertSpendSafetyConfigured({ ...testEnv, BIDBEACON_MAX_BID: '0' })).toThrow(GREATER_THAN_ZERO);
        expect(() => assertSpendSafetyConfigured({ ...testEnv, BIDBEACON_MAX_WRITES_PER_HOUR: '1.5' })).toThrow(INTEGER_REQUIRED);
    });
});

describe('spend ceilings', () => {
    const policy = getSpendSafetyPolicy(testEnv);

    it('allows bids and budgets at the ceiling', () => {
        expect(() => assertBidCeiling(5, 'bid', policy)).not.toThrow();
        expect(() => assertDailyBudgetCeiling(100, policy)).not.toThrow();
        expect(() => assertPlacementCeilings({ topOfSearch: 100 }, [2.5], policy)).not.toThrow();
        expect(() => assertPlacementCeilings({ topOfSearch: 900 }, [], policy)).not.toThrow();
    });

    it('refuses values just above each ceiling without clamping', () => {
        expect(() => assertBidCeiling(5.01, 'bid', policy)).toThrow(OperationError);
        expect(() => assertDailyBudgetCeiling(100.01, policy)).toThrow(OperationError);
        try {
            assertBidCeiling(5.01, 'bid', policy);
        } catch (error) {
            expect(error).toMatchObject({
                code: 'INVALID_INPUT',
                details: { field: 'bid', requested: 5.01, max: 5 },
            });
            expect((error as Error).message).toMatch(HUMAN_NEEDED);
        }
    });

    it('refuses values well above each ceiling', () => {
        expect(() => assertBidCeiling(50, 'defaultBid', policy)).toThrow(MAX_BID_MESSAGE);
        expect(() => assertDailyBudgetCeiling(10_000, policy)).toThrow(MAX_DAILY_BUDGET_MESSAGE);
        expect(() => assertPlacementCeilings({ topOfSearch: 900 }, [5], policy)).toThrow(EFFECTIVE_BID_MESSAGE);
        expect(() => assertBidStrategyCeiling('DYNAMIC_UP_AND_DOWN', policy)).toThrow(DYNAMIC_UP_AND_DOWN_MESSAGE);
        expect(() => assertBidStrategyCeiling('SALES_UP_AND_DOWN', policy)).toThrow(DYNAMIC_UP_AND_DOWN_MESSAGE);
    });

    it('refuses bid writes when placement adjustments are unsynced', () => {
        expect(() => assertPlacementCeilings(null, [5], policy)).toThrow(OperationError);
        expect(() => assertPlacementCeilings({}, [5], policy)).not.toThrow();
    });

    it('refuses bid writes when stored bid strategy is missing or unrecognized', () => {
        expect(() => assertStoredBidStrategyAllowsSpendWrite(null, policy)).toThrow(OperationError);
        expect(() => assertStoredBidStrategyAllowsSpendWrite('WEIRD_STRATEGY', policy)).toThrow(OperationError);
        expect(() => assertStoredBidStrategyAllowsSpendWrite('SALES_DOWN_ONLY', policy)).not.toThrow();
        expect(() => assertStoredBidStrategyAllowsSpendWrite('FIXED', policy)).not.toThrow();
    });

    it('maps production NONE to FIXED and refuses RULE_BASED as up-and-down', () => {
        expect(() => assertStoredBidStrategyAllowsSpendWrite('NONE', policy)).not.toThrow();
        expect(() => assertStoredBidStrategyAllowsSpendWrite('RULE_BASED', policy)).toThrow(DYNAMIC_UP_AND_DOWN_MESSAGE);
        expect(() => assertBidStrategyCeiling('RULE_BASED', policy)).toThrow(DYNAMIC_UP_AND_DOWN_MESSAGE);
        expect(() => assertBidStrategyCeiling('SALES', policy)).toThrow(DYNAMIC_UP_AND_DOWN_MESSAGE);
    });
});

describe('spend write rate limit', () => {
    it('refuses the write after the hourly quota is exhausted', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
        const policy = getSpendSafetyPolicy(testEnv);
        const accountId = 'account-rate-limit';

        await withSpendWriteQuota(accountId, async () => 'one', policy);
        await withSpendWriteQuota(accountId, async () => 'two', policy);
        await withSpendWriteQuota(accountId, async () => 'three', policy);

        await expect(withSpendWriteQuota(accountId, async () => 'four', policy)).rejects.toMatchObject({
            code: 'WRITE_RATE_LIMITED',
            details: { accountId, limit: 3, windowHours: 1 },
        });

        vi.setSystemTime(new Date('2026-11-18T13:00:01.000Z'));
        await expect(withSpendWriteQuota(accountId, async () => 'five', policy)).resolves.toBe('five');
    });

    it('counts nested spend writes once for a composite-style call stack', async () => {
        const policy = getSpendSafetyPolicy({ ...testEnv, BIDBEACON_MAX_WRITES_PER_HOUR: '1' });
        const accountId = 'account-nested';

        await withSpendWriteQuota(accountId, async () => withSpendWriteQuota(accountId, async () => 'nested', policy), policy);
        await expect(withSpendWriteQuota(accountId, async () => 'next', policy)).rejects.toMatchObject({ code: 'WRITE_RATE_LIMITED' });
    });
});
