import { fromZonedTime } from 'date-fns-tz';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNextRefreshTime, isEligibleForReport } from '@/lib/report-status-state-machine/eligibility';

describe('report eligibility timezone handling', () => {
    // Sample timestamps mirror production report_dataset_metadata rows for hourly US targets.
    afterEach(() => {
        vi.useRealTimers();
    });

    it('schedules the next hourly refresh at the 72h offset for a completed hourly row', () => {
        vi.useFakeTimers();

        const timezone = 'America/Los_Angeles';
        const countryCode = 'US';
        const periodStart = new Date(Date.UTC(2025, 11, 29, 17, 0, 0));
        const lastReportCreatedAt = new Date(2025, 11, 30, 17, 0, 2);
        const now = fromZonedTime(new Date(2025, 11, 30, 17, 0, 2), timezone);

        vi.setSystemTime(now);

        const nextRefreshAt = getNextRefreshTime({
            reportId: null,
            periodStart,
            aggregation: 'hourly',
            lastReportCreatedAt,
            countryCode,
        });

        const expected = new Date(Date.UTC(2026, 0, 1, 17, 0, 0));
        expect(nextRefreshAt?.getTime()).toBe(expected.getTime());
    });

    it('does not mark hourly data as eligible when a 24h report was already created', () => {
        const timezone = 'America/Los_Angeles';
        const countryCode = 'US';
        const periodStart = new Date(Date.UTC(2025, 11, 30, 1, 0, 0));
        const lastReportCreatedAt = new Date(2025, 11, 30, 17, 25, 8);
        const now = new Date(Date.UTC(2025, 11, 31, 2, 0, 0));

        const eligible = isEligibleForReport(periodStart, 'hourly', lastReportCreatedAt, countryCode, now);

        expect(eligible).toBe(false);
    });
});
