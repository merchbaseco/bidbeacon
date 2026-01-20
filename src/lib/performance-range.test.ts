import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';
import { getPerformanceRange } from '@/lib/performance-range';

const formatDate = (value: Date, timezone: string) => formatInTimeZone(value, timezone, 'yyyy-MM-dd');

describe('getPerformanceRange', () => {
    it('aligns this_week comparisons to the previous week-to-date window', () => {
        const timezone = 'America/Los_Angeles';
        const now = fromZonedTime('2026-01-14T12:00:00', timezone);

        const result = getPerformanceRange({ range: 'this_week', timezone, now });

        expect(formatDate(result.rangeStartUtc, timezone)).toBe('2026-01-11');
        expect(formatDate(result.compareStartUtc!, timezone)).toBe('2026-01-04');
        expect(formatDate(result.compareEndExclusiveUtc!, timezone)).toBe('2026-01-08');
    });

    it('clamps this_month comparisons to the previous month length', () => {
        const timezone = 'America/Los_Angeles';
        const now = fromZonedTime('2026-03-31T09:00:00', timezone);

        const result = getPerformanceRange({ range: 'this_month', timezone, now });

        expect(formatDate(result.compareStartUtc!, timezone)).toBe('2026-02-01');
        expect(formatDate(result.compareEndExclusiveUtc!, timezone)).toBe('2026-03-01');
    });

    it('clamps this_year comparisons for leap-day', () => {
        const timezone = 'America/Los_Angeles';
        const now = fromZonedTime('2024-02-29T12:00:00', timezone);

        const result = getPerformanceRange({ range: 'this_year', timezone, now });

        expect(formatDate(result.compareStartUtc!, timezone)).toBe('2023-01-01');
        expect(formatDate(result.compareEndExclusiveUtc!, timezone)).toBe('2023-03-01');
    });

    it('supports custom ranges with rolling comparisons', () => {
        const timezone = 'America/Los_Angeles';
        const now = fromZonedTime('2026-03-08T12:00:00', timezone);

        const result = getPerformanceRange({
            range: 'today',
            timezone,
            now,
            customRange: { start: '2026-02-03', end: '2026-03-08' },
        });

        expect(result.granularity).toBe('day');
        expect(formatDate(result.rangeStartUtc, timezone)).toBe('2026-02-03');
        expect(formatDate(result.rangeEndUtc, timezone)).toBe('2026-03-08');
        expect(result.compareEndExclusiveUtc?.getTime()).toBe(result.rangeStartUtc.getTime());
    });

    it('uses hourly granularity for single-day custom ranges', () => {
        const timezone = 'America/Los_Angeles';
        const now = fromZonedTime('2026-02-03T12:00:00', timezone);

        const result = getPerformanceRange({
            range: 'today',
            timezone,
            now,
            customRange: { start: '2026-02-03', end: '2026-02-03' },
        });

        expect(result.granularity).toBe('hour');
    });
});
