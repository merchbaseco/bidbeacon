import { describe, expect, it } from 'vitest';
import { formatError, serializeError } from './errors';

describe('error serialization', () => {
    it('keeps structured PostgreSQL fields without query parameters', () => {
        const error = Object.assign(new Error('deadlock detected'), {
            code: '40P01',
            detail: 'Process 1 waits for Process 2.',
            table_name: 'performance_hourly',
            constraint_name: 'performance_hourly_pk',
            query: 'INSERT INTO performance_hourly VALUES (...)',
            parameters: Array.from({ length: 1000 }, (_, index) => index),
        });

        expect(serializeError(error)).toMatchObject({
            message: 'deadlock detected',
            code: '40P01',
            detail: 'Process 1 waits for Process 2.',
            table: 'performance_hourly',
            constraint: 'performance_hourly_pk',
        });
        expect(JSON.stringify(serializeError(error))).not.toContain('parameters');
        expect(formatError(error)).toBe('40P01: deadlock detected (constraint=performance_hourly_pk, table=performance_hourly)');
    });

    it('bounds oversized messages and causes', () => {
        const cause = new Error('cause');
        const error = new Error('x'.repeat(10_000), { cause });
        const serialized = serializeError(error);

        expect(serialized.message.length).toBeLessThanOrEqual(2000);
        expect(serialized.cause?.message).toBe('cause');
    });
});
