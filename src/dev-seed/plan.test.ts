import { formatInTimeZone } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';
import { buildDevSeedPlan, DEFAULT_SEED_OPTIONS } from './plan';
import type { DevSeedOptions } from './types';

/**
 * The seed exists so a developer — or a cloud agent that has never seen the
 * product — can open any BidBeacon surface and find a believable week of
 * advertising on it. These assertions are that promise, not a snapshot of the
 * plan's incidental shape.
 */

const NOW = new Date('2026-08-25T19:30:00.000Z');

const buildPlan = (overrides: Partial<DevSeedOptions> = {}) => buildDevSeedPlan({ ...DEFAULT_SEED_OPTIONS, now: NOW, ...overrides });

describe('buildDevSeedPlan', () => {
    it('is reproducible for a seed and varied across seeds', () => {
        expect(buildPlan()).toEqual(buildPlan());
        expect(buildPlan({ seed: 'friday' })).not.toEqual(buildPlan());
    });

    it('fills every table the dashboard reads', () => {
        const plan = buildPlan();

        for (const [table, rows] of Object.entries(plan.rows)) {
            expect(rows.length, `${table} has no rows`).toBeGreaterThan(0);
        }
    });

    it('seeds an ad structure worth opening', () => {
        const plan = buildPlan();

        expect(plan.rows.campaign.length).toBeGreaterThanOrEqual(6);
        expect(plan.rows.adGroup.length).toBeGreaterThan(plan.rows.campaign.length);
        expect(plan.rows.target.length).toBeGreaterThan(20);

        // The branches every list and detail surface renders differently.
        expect(new Set(plan.rows.campaign.map(row => row.state))).toEqual(new Set(['ENABLED', 'PAUSED']));
        expect(new Set(plan.rows.campaign.map(row => row.deliveryStatus))).toContain('OUT_OF_BUDGET');
        expect(new Set(plan.rows.campaign.map(row => row.targetingSettings))).toEqual(new Set(['AUTO', 'MANUAL']));
        expect(new Set(plan.rows.target.map(row => row.targetType))).toEqual(new Set(['AUTO', 'KEYWORD', 'PRODUCT']));
        expect(plan.rows.target.some(row => row.negative)).toBe(true);
        expect(plan.rows.target.some(row => row.state === 'PAUSED')).toBe(true);
        expect(new Set(plan.rows.ad.map(row => row.productAsin)).size).toBeGreaterThan(3);
        expect(plan.rows.campaign.some(row => row.endDate !== null)).toBe(true);
    });

    it('always describes the current week in the account timezone', () => {
        const plan = buildPlan();
        const today = formatInTimeZone(NOW, plan.timezone, 'yyyy-MM-dd');
        const dailyDays = new Set(plan.rows.performanceDaily.map(row => String(row.bucketDate)));
        const hourlyDays = new Set(plan.rows.performanceHourly.map(row => String(row.bucketDate)));

        expect(dailyDays.size).toBeGreaterThan(7);
        expect([...dailyDays].sort().at(-1)).toBe(today);
        expect(hourlyDays).toContain(today);
        expect(hourlyDays.size).toBe(2);
    });

    it('leaves today in progress rather than mysteriously complete', () => {
        const plan = buildPlan();
        const today = formatInTimeZone(NOW, plan.timezone, 'yyyy-MM-dd');
        const currentHour = Number(formatInTimeZone(NOW, plan.timezone, 'H'));
        const todaysHours = plan.rows.performanceHourly.filter(row => String(row.bucketDate) === today).map(row => row.bucketHour);

        expect(Math.max(...todaysHours)).toBeLessThanOrEqual(currentHour);
        expect(todaysHours.length).toBeGreaterThan(0);
    });

    // The hourly primary key is (account, bucketStart, ad, entityType, entity),
    // and the day the clock changes is where a 24-hour assumption breaks it:
    // the 25-hour day repeats a local hour, and the 23-hour day skips one.
    it('survives the days the clock changes', () => {
        for (const now of [new Date('2026-11-01T20:00:00.000Z'), new Date('2026-03-08T20:00:00.000Z')]) {
            const plan = buildPlan({ now });
            const keys = plan.rows.performanceHourly.map(row => [row.accountId, (row.bucketStart as Date).toISOString(), row.adId, row.entityType, row.entityId].join('|'));

            expect(new Set(keys).size).toBe(keys.length);
            for (const row of plan.rows.performanceHourly) {
                expect(row.bucketHour).toBe(Number(formatInTimeZone(row.bucketStart as Date, plan.timezone, 'H')));
                expect(row.bucketDate).toBe(formatInTimeZone(row.bucketStart as Date, plan.timezone, 'yyyy-MM-dd'));
            }
        }
    });

    it('repeats the local hour the 25-hour day repeats', () => {
        const plan = buildPlan({ now: new Date('2026-11-01T20:00:00.000Z') });
        const hoursByTarget = new Map<string, number[]>();

        for (const row of plan.rows.performanceHourly.filter(candidate => candidate.bucketDate === '2026-11-01')) {
            hoursByTarget.set(`${row.adId}|${row.entityId}`, [...(hoursByTarget.get(`${row.adId}|${row.entityId}`) ?? []), row.bucketHour]);
        }

        expect([...hoursByTarget.values()].some(hours => new Set(hours).size !== hours.length)).toBe(true);
    });

    it('spends on a head and a long tail, never on a negative', () => {
        const spendByTarget = new Map<string, number>();
        const plan = buildPlan();

        for (const row of plan.rows.performanceDaily) {
            spendByTarget.set(String(row.entityId), (spendByTarget.get(String(row.entityId)) ?? 0) + Number(row.spend));
        }

        const ranked = [...spendByTarget.values()].sort((left, right) => right - left);
        expect(ranked.length).toBeGreaterThan(10);
        expect(ranked[0]).toBeGreaterThan((ranked.at(-1) ?? 0) * 3);

        const negativeIds = new Set(plan.rows.target.filter(row => row.negative).map(row => row.targetId));
        expect([...spendByTarget.keys()].some(entityId => negativeIds.has(entityId))).toBe(false);
    });

    it('keeps the funnel arithmetic believable', () => {
        const plan = buildPlan();

        for (const row of [...plan.rows.performanceDaily, ...plan.rows.performanceHourly]) {
            expect(row.clicks).toBeLessThanOrEqual(row.impressions);
            expect(row.purchases).toBeLessThanOrEqual(row.clicks);
            expect(row.impressions).toBeGreaterThan(0);
            expect(row.entityType).toBe('target');
        }
    });

    it('covers the report state machine and the account setup card', () => {
        const plan = buildPlan();
        const statuses = new Set(plan.rows.reportDatasetMetadata.map(row => row.status));

        expect(statuses).toContain('completed');
        expect(statuses).toContain('fetching');
        expect(statuses).toContain('failed');
        expect(statuses).toContain('missing');
        expect(new Set(plan.rows.reportDatasetMetadata.map(row => row.aggregation))).toEqual(new Set(['daily', 'hourly']));
        expect(plan.rows.accountDatasetMetadata[0]?.campaignsCount).toBe(plan.rows.campaign.length);
        expect(plan.rows.accountDatasetMetadata[0]?.fetchingCampaigns).toBe(false);
    });

    it('gives the operational surfaces something to plot', () => {
        const plan = buildPlan();

        // The aggregation chart sums this job's `rowsInserted` payload, and the
        // event stream is scoped by account and country.
        expect(plan.rows.events.some(row => row.jobName === 'summarize-daily-target-stream-for-account')).toBe(true);
        expect(plan.rows.events.every(row => row.accountId === plan.accountId && row.countryCode === plan.countryCode)).toBe(true);
        expect(plan.rows.events.some(row => row.outcome === 'error')).toBe(true);
        expect(plan.rows.jobMetrics.some(row => row.status === 'failed')).toBe(true);
        expect(plan.rows.apiMetrics.some(row => row.statusCode === 429)).toBe(true);
        expect(new Set(plan.rows.amsMetrics.map(row => row.entityType)).size).toBeGreaterThanOrEqual(6);
        expect(plan.rows.entityChangeHistory.some(row => row.eventType === 'bid_change')).toBe(true);
    });

    it('grants the account to a signed-in user and preselects it', () => {
        const plan = buildPlan({ merchbaseUserId: 'mbu_zach' });

        expect(plan.rows.userAccountAccess[0]).toMatchObject({ adsAccountId: plan.accountId, advertiserAccountId: plan.advertiserAccountId, merchbaseUserId: 'mbu_zach' });
        expect(plan.rows.userPreferences[0]?.selectedAdsAccountId).toBe(plan.accountId);
        expect(plan.rows.advertiserAccount[0]?.enabled).toBe(true);
    });

    it('stays a small slice rather than a data dump', () => {
        const total = Object.values(buildPlan().summary).reduce((sum, count) => sum + count, 0);

        expect(total).toBeLessThan(5000);
    });

    it('honours a shorter window', () => {
        const days = new Set(buildPlan({ dayCount: 5 }).rows.performanceDaily.map(row => String(row.bucketDate)));

        expect(days.size).toBeLessThanOrEqual(5);
    });
});
