import { describe, expect, it } from 'vitest';
import { hasDateStateChanged } from '@/lib/daily-target-freshness/date-event';

const derived = { outcome: 'derived-from-hourly', reason: 'hourly-newer', rowsDerived: 7131 } as const;

describe('hasDateStateChanged', () => {
    it('records the first event for a date', () => {
        expect(hasDateStateChanged(undefined, derived)).toBe(true);
    });

    it('stays quiet while the source and row count are unchanged', () => {
        expect(hasDateStateChanged({ ...derived }, derived)).toBe(false);
    });

    it('records a change of source or reason', () => {
        expect(hasDateStateChanged({ ...derived, outcome: 'kept-daily-report', reason: 'daily-newer' }, derived)).toBe(true);
        expect(hasDateStateChanged({ ...derived, reason: 'no-daily-report' }, derived)).toBe(true);
    });

    it('records a change in the derived row count', () => {
        expect(hasDateStateChanged({ ...derived, rowsDerived: 7130 }, derived)).toBe(true);
    });
});
