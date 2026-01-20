import { describe, expect, it } from 'vitest';
import { formatInTimeZone } from 'date-fns-tz';
import { zonedTopOfHour } from '@/utils/date';

describe('zonedTopOfHour', () => {
    it('floors to the top of the hour in the target timezone', () => {
        const timezone = 'America/Los_Angeles';
        const input = new Date('2025-01-15T18:34:56.000Z');

        const result = zonedTopOfHour(input, timezone);

        expect(result.toISOString()).toBe('2025-01-15T18:00:00.000Z');
        expect(formatInTimeZone(result, timezone, 'yyyy-MM-dd HH:mm')).toBe('2025-01-15 10:00');
    });

    it('uses the earlier offset during the fall-back repeated hour', () => {
        const timezone = 'America/Los_Angeles';
        const input = new Date('2025-11-02T09:30:00.000Z');

        const result = zonedTopOfHour(input, timezone);

        expect(result.toISOString()).toBe('2025-11-02T08:00:00.000Z');
        expect(formatInTimeZone(result, timezone, 'yyyy-MM-dd HH:mm')).toBe('2025-11-02 01:00');
    });
});
