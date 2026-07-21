import { fromZonedTime } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';
import { getNextRefreshTime, getRefreshSchedule, isEligibleForReport } from '@/lib/report-status-state-machine/eligibility';

const PACIFIC = 'America/Los_Angeles';

describe('report refresh scheduling', () => {
    it('reconciles an hourly-grain date every three hours during its first post-close day', () => {
        const periodStart = localDate(2026, 7, 19);
        const schedule = getRefreshSchedule(periodStart, 'hourly', 'US');

        expect(schedule.slice(0, 8).map(date => date.toISOString())).toEqual([
            '2026-07-20T10:00:00.000Z',
            '2026-07-20T13:00:00.000Z',
            '2026-07-20T16:00:00.000Z',
            '2026-07-20T19:00:00.000Z',
            '2026-07-20T22:00:00.000Z',
            '2026-07-21T01:00:00.000Z',
            '2026-07-21T04:00:00.000Z',
            '2026-07-21T07:00:00.000Z',
        ]);
    });

    it('adds the 3-day, 7-day, and just-inside-14-day hourly reconciliations', () => {
        const schedule = getRefreshSchedule(localDate(2026, 7, 19), 'hourly', 'US');

        expect(schedule.slice(8).map(date => date.toISOString())).toEqual(['2026-07-22T07:00:00.000Z', '2026-07-26T07:00:00.000Z', '2026-08-02T04:00:00.000Z']);
    });

    it('advances to the first milestone after the last report creation', () => {
        const periodStart = localDate(2026, 7, 19);
        const firstMilestone = getRefreshSchedule(periodStart, 'hourly', 'US')[0] ?? null;

        const nextRefreshAt = getNextRefreshTime(
            {
                reportId: null,
                periodStart,
                aggregation: 'hourly',
                lastReportCreatedAt: firstMilestone,
                countryCode: 'US',
            },
            new Date('2026-07-20T10:01:00.000Z')
        );

        expect(nextRefreshAt?.toISOString()).toBe('2026-07-20T13:00:00.000Z');
    });

    it('marks overdue milestones eligible until a report covers them', () => {
        const periodStart = localDate(2026, 7, 19);
        const schedule = getRefreshSchedule(periodStart, 'hourly', 'US');

        expect(isEligibleForReport(periodStart, 'hourly', schedule[0] ?? null, 'US', new Date('2026-07-20T14:00:00.000Z'))).toBe(true);
        expect(isEligibleForReport(periodStart, 'hourly', schedule[1] ?? null, 'US', new Date('2026-07-20T14:00:00.000Z'))).toBe(false);
    });

    it('uses account-local calendar days across daylight-saving changes', () => {
        const periodStart = localDate(2026, 3, 7);
        const schedule = getRefreshSchedule(periodStart, 'daily', 'US');

        expect(schedule[0]?.toISOString()).toBe('2026-03-08T08:00:00.000Z');
        expect(schedule[1]?.toISOString()).toBe('2026-03-10T07:00:00.000Z');
    });

    it('polls an in-flight report five minutes from now', () => {
        const now = new Date('2026-07-20T10:01:00.000Z');
        const nextRefreshAt = getNextRefreshTime(
            {
                reportId: 'report-id',
                periodStart: localDate(2026, 7, 19),
                aggregation: 'hourly',
                lastReportCreatedAt: null,
                countryCode: 'US',
            },
            now
        );

        expect(nextRefreshAt?.toISOString()).toBe('2026-07-20T10:06:00.000Z');
    });
});

const localDate = (year: number, month: number, day: number): Date => fromZonedTime(new Date(year, month - 1, day), PACIFIC);
