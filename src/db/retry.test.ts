import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTransientDatabaseError, withDatabaseRetry } from './retry';

afterEach(() => {
    vi.useRealTimers();
});

describe('database retries', () => {
    it('retries transient PostgreSQL failures with exponential jitter', async () => {
        vi.useFakeTimers();
        const operation = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(Object.assign(new Error('deadlock'), { code: '40P01' }))
            .mockRejectedValueOnce(Object.assign(new Error('serialization'), { code: '40001' }))
            .mockResolvedValue('ok');

        const promise = withDatabaseRetry(operation, { baseDelayMs: 100, random: () => 0.5 });
        await vi.runAllTimersAsync();

        await expect(promise).resolves.toBe('ok');
        expect(operation).toHaveBeenCalledTimes(3);
    });

    it('does not retry permanent failures', async () => {
        const operation = vi.fn<() => Promise<string>>().mockRejectedValue(Object.assign(new Error('unique violation'), { code: '23505' }));

        await expect(withDatabaseRetry(operation)).rejects.toThrow('unique violation');
        expect(operation).toHaveBeenCalledTimes(1);
        expect(isTransientDatabaseError({ code: '23505' })).toBe(false);
    });

    it('retries PostgreSQL failures wrapped by Drizzle', async () => {
        vi.useFakeTimers();
        const postgresError = Object.assign(new Error('deadlock'), { code: '40P01' });
        const operation = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new DrizzleQueryError('insert into performance_hourly', [], postgresError))
            .mockResolvedValue('ok');

        const promise = withDatabaseRetry(operation, { baseDelayMs: 100, random: () => 0 });
        await vi.runAllTimersAsync();

        await expect(promise).resolves.toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
    });
});
