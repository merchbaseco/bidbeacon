import { describe, expect, it } from 'vitest';
import { getHourlyStreamOwnershipStart } from './date';

describe('hourly Stream ownership', () => {
    it('floors the trailing window to a whole account-local hour bucket', () => {
        const boundary = getHourlyStreamOwnershipStart(new Date('2026-07-21T17:05:42.000Z'), 'America/Los_Angeles');

        expect(boundary.toISOString()).toBe('2026-07-20T17:00:00.000Z');
    });
});
