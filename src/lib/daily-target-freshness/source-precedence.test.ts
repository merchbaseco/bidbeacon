import { describe, expect, it } from 'vitest';
import { chooseDailyTargetSource, getFreshnessDates, resolveStreamAsOf } from '@/lib/daily-target-freshness/source-precedence';

const PACIFIC = 'America/Los_Angeles';

// Production metadata shapes from the US account on 2026-11-07 22:07 PT.
const NOW = new Date('2026-11-08T06:07:45.000Z');
const STREAM_ROLLUP = new Date('2026-11-08T06:05:00.000Z');

describe('getFreshnessDates', () => {
    it('returns today and the two most recent closed account-local dates', () => {
        expect(serialize(getFreshnessDates(NOW, PACIFIC))).toEqual([
            { bucketDate: '2026-11-07', periodStart: '2026-11-07T08:00:00.000Z', periodEnd: '2026-11-08T08:00:00.000Z' },
            { bucketDate: '2026-11-06', periodStart: '2026-11-06T08:00:00.000Z', periodEnd: '2026-11-07T08:00:00.000Z' },
            { bucketDate: '2026-11-05', periodStart: '2026-11-05T08:00:00.000Z', periodEnd: '2026-11-06T08:00:00.000Z' },
        ]);
    });

    it('uses a 25-hour fall-back date and a 23-hour spring-forward date', () => {
        const fallBack = getFreshnessDates(new Date('2026-11-02T20:00:00.000Z'), PACIFIC)[1];
        expect(serialize([fallBack])).toEqual([{ bucketDate: '2026-11-01', periodStart: '2026-11-01T07:00:00.000Z', periodEnd: '2026-11-02T08:00:00.000Z' }]);

        const springForward = getFreshnessDates(new Date('2026-03-09T20:00:00.000Z'), PACIFIC)[1];
        expect(serialize([springForward])).toEqual([{ bucketDate: '2026-03-08', periodStart: '2026-03-08T08:00:00.000Z', periodEnd: '2026-03-09T07:00:00.000Z' }]);
    });
});

describe('resolveStreamAsOf', () => {
    it('uses the older of the rollup start and the latest stored AMS message', () => {
        expect(resolveStreamAsOf({ hasEntityId: true, rollupStartedAt: STREAM_ROLLUP, latestReceivedAt: new Date('2026-11-08T05:45:07.988Z'), now: NOW })).toEqual(
            new Date('2026-11-08T05:45:07.988Z')
        );
        expect(resolveStreamAsOf({ hasEntityId: true, rollupStartedAt: STREAM_ROLLUP, latestReceivedAt: new Date('2026-11-08T06:06:00.000Z'), now: NOW })).toEqual(STREAM_ROLLUP);
    });

    it('treats Stream as not fresh when no AMS message arrived in the last 90 minutes, so the daily report wins', () => {
        const streamAsOf = resolveStreamAsOf({ hasEntityId: true, rollupStartedAt: STREAM_ROLLUP, latestReceivedAt: new Date('2026-11-08T04:30:00.000Z'), now: NOW });
        expect(streamAsOf).toBeNull();

        const decision = chooseDailyTargetSource({
            period: freshnessDate(1),
            daily: processed('2026-11-07T08:00:54.401Z'),
            hourly: null,
            streamRolledUpAt: streamAsOf,
            timezone: PACIFIC,
        });
        expect(decision).toMatchObject({ source: 'daily', reason: 'no-hourly-data' });
    });

    it('never treats an account without an entity id as Stream-fresh', () => {
        expect(resolveStreamAsOf({ hasEntityId: false, rollupStartedAt: STREAM_ROLLUP, latestReceivedAt: STREAM_ROLLUP, now: NOW })).toBeNull();
    });

    it('needs both a successful rollup and a stored AMS message', () => {
        expect(resolveStreamAsOf({ hasEntityId: true, rollupStartedAt: null, latestReceivedAt: STREAM_ROLLUP, now: NOW })).toBeNull();
        expect(resolveStreamAsOf({ hasEntityId: true, rollupStartedAt: STREAM_ROLLUP, latestReceivedAt: null, now: NOW })).toBeNull();
    });
});

describe('chooseDailyTargetSource', () => {
    const today = freshnessDate(0);
    const yesterday = freshnessDate(1);
    const twoDaysAgo = freshnessDate(2);

    it('derives a closed date from hourly when the hourly report is newer than the daily report', () => {
        const decision = chooseDailyTargetSource({
            period: twoDaysAgo,
            daily: processed('2026-11-06T08:00:14.557Z'),
            hourly: processed('2026-11-07T08:06:24.957Z'),
            streamRolledUpAt: STREAM_ROLLUP,
            timezone: PACIFIC,
        });

        expect(decision.source).toBe('hourly');
        expect(decision.reason).toBe('hourly-newer');
        expect(decision.streamAsOf).toBeNull();
        expect(decision.hourlyAsOf?.toISOString()).toBe('2026-11-07T08:06:24.957Z');
    });

    it('keeps the daily report when it was created after the hourly report', () => {
        const decision = chooseDailyTargetSource({
            period: twoDaysAgo,
            daily: processed('2026-11-07T08:38:25.613Z'),
            hourly: processed('2026-11-07T08:32:26.962Z'),
            streamRolledUpAt: STREAM_ROLLUP,
            timezone: PACIFIC,
        });

        expect(decision).toMatchObject({ source: 'daily', reason: 'daily-newer' });
    });

    it('treats yesterday as Stream-fresh while the trailing rollup window still reaches into it', () => {
        const decision = chooseDailyTargetSource({
            period: yesterday,
            daily: processed('2026-11-07T08:00:54.401Z'),
            hourly: processed('2026-11-07T05:00:00.000Z'),
            streamRolledUpAt: STREAM_ROLLUP,
            timezone: PACIFIC,
        });

        expect(decision).toMatchObject({ source: 'hourly', reason: 'hourly-newer' });
        expect(decision.streamAsOf?.toISOString()).toBe(STREAM_ROLLUP.toISOString());
    });

    it('derives today from the Stream rollup before any daily report exists', () => {
        const decision = chooseDailyTargetSource({
            period: today,
            daily: { lastReportCreatedAt: null },
            hourly: null,
            streamRolledUpAt: STREAM_ROLLUP,
            timezone: PACIFIC,
        });

        expect(decision).toMatchObject({ source: 'hourly', reason: 'no-daily-report' });
    });

    it('leaves a date alone when no hourly source has refreshed it', () => {
        const decision = chooseDailyTargetSource({ period: today, daily: null, hourly: null, streamRolledUpAt: null, timezone: PACIFIC });

        expect(decision).toMatchObject({ source: 'daily', reason: 'no-hourly-data' });
    });

    it('ignores an hourly report creation time that belongs to an unprocessed report', () => {
        const inFlight = { ...processed('2026-11-07T08:06:24.957Z'), reportId: 'pending-report' };
        const failed = { ...processed('2026-11-07T08:06:24.957Z'), status: 'error' };

        for (const hourly of [inFlight, failed]) {
            expect(chooseDailyTargetSource({ period: twoDaysAgo, daily: processed('2026-11-06T08:00:14.557Z'), hourly, streamRolledUpAt: null, timezone: PACIFIC })).toMatchObject({
                source: 'daily',
                reason: 'no-hourly-data',
            });
        }
    });

    it('stops deriving once a daily report newer than the hourly data has been requested', () => {
        const decision = chooseDailyTargetSource({
            period: twoDaysAgo,
            daily: { lastReportCreatedAt: new Date('2026-11-07T09:00:00.000Z') },
            hourly: processed('2026-11-07T08:06:24.957Z'),
            streamRolledUpAt: null,
            timezone: PACIFIC,
        });

        expect(decision).toMatchObject({ source: 'daily', reason: 'daily-newer' });
    });
});

const freshnessDate = (offset: number) => {
    const date = getFreshnessDates(NOW, PACIFIC)[offset];
    if (!date) {
        throw new Error(`Missing freshness date ${offset}`);
    }
    return date;
};

const processed = (createdAt: string) => ({
    lastReportCreatedAt: new Date(createdAt),
    lastProcessedReportId: 'processed-report',
    reportId: null,
    status: 'completed',
});

const serialize = (dates: Array<{ bucketDate: string; periodStart: Date; periodEnd: Date } | undefined>) =>
    dates.map(date => ({ bucketDate: date?.bucketDate, periodStart: date?.periodStart.toISOString(), periodEnd: date?.periodEnd.toISOString() }));
