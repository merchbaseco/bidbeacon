import { describe, expect, it } from 'vitest';
import { parseHourlyTimestamp } from './parse-period-start-timestamp';

describe('parseHourlyTimestamp', () => {
    it('handles spring-forward hours using the post-DST offset', () => {
        const timezone = 'America/Los_Angeles';

        const beforeJump = parseHourlyTimestamp('2025-03-09T01:00:00', timezone);
        expect(beforeJump.bucketStart.toISOString()).toBe('2025-03-09T09:00:00.000Z');

        const afterJump = parseHourlyTimestamp('2025-03-09T03:00:00', timezone);
        expect(afterJump.bucketStart.toISOString()).toBe('2025-03-09T10:00:00.000Z');
    });

    it('uses the earlier offset for the fall-back repeated hour', () => {
        const timezone = 'America/Los_Angeles';
        const result = parseHourlyTimestamp('2025-11-02T01:00:00', timezone);

        expect(result.bucketStart.toISOString()).toBe('2025-11-02T08:00:00.000Z');
        expect(result.bucketDate).toBe('2025-11-02');
        expect(result.bucketHour).toBe(1);
    });
});
