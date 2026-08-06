import { describe, expect, it } from 'vitest';
import { getHourlyReportRetentionWindow, getPlacementReportRetentionWindow } from '@/lib/report-retention';

describe('hourly report retention', () => {
    it('keeps exactly 14 account-local dates including today', () => {
        const window = getHourlyReportRetentionWindow(new Date('2026-07-21T23:30:00.000Z'), 'America/Los_Angeles');

        expect(window.latestPeriodStart.toISOString()).toBe('2026-07-21T07:00:00.000Z');
        expect(window.earliestPeriodStart.toISOString()).toBe('2026-07-08T07:00:00.000Z');
    });

    it('uses local calendar days across daylight-saving changes', () => {
        const window = getHourlyReportRetentionWindow(new Date('2026-03-10T18:00:00.000Z'), 'America/Los_Angeles');

        expect(window.latestPeriodStart.toISOString()).toBe('2026-03-10T07:00:00.000Z');
        expect(window.earliestPeriodStart.toISOString()).toBe('2026-02-25T08:00:00.000Z');
    });
});

describe('placement report retention', () => {
    it('keeps exactly 90 account-local dates including today across daylight-saving changes', () => {
        const window = getPlacementReportRetentionWindow(new Date('2026-03-10T18:00:00.000Z'), 'America/Los_Angeles');

        expect(window.latestPeriodStart.toISOString()).toBe('2026-03-10T07:00:00.000Z');
        expect(window.earliestPeriodStart.toISOString()).toBe('2025-12-11T08:00:00.000Z');
    });
});
