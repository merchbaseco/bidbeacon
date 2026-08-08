import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/index';
import { emitEvent } from '@/utils/events';
import { withTracking } from './api-tracker';

vi.mock('@/db/index', () => ({
    db: {
        insert: vi.fn(),
    },
}));

vi.mock('@/utils/events', () => ({
    emitEvent: vi.fn(),
}));

describe('API tracker request metrics', () => {
    const insertMock = vi.mocked(db.insert);
    let recordedValues: Record<string, unknown> | undefined;

    beforeEach(() => {
        recordedValues = undefined;
        insertMock.mockReset();
        vi.mocked(emitEvent).mockReset();
        insertMock.mockReturnValue({
            values: vi.fn(values => {
                recordedValues = values as Record<string, unknown>;
                return {
                    returning: vi.fn(async () => [
                        {
                            ...recordedValues,
                            timestamp: recordedValues?.timestamp as Date,
                        },
                    ]),
                };
            }),
        } as ReturnType<typeof db.insert>);
    });

    it('records zero attempts when a failure happens before the HTTP request', async () => {
        await expect(
            withTracking({ apiName: 'createReport', region: 'na' }, async () => {
                throw new Error('Missing ADS_API_CLIENT_ID environment variable');
            })
        ).rejects.toThrow('Missing ADS_API_CLIENT_ID');

        expect(recordedValues).toEqual(expect.objectContaining({ attemptCount: 0, retryCount: 0, rateLimitCount: 0 }));
    });

    it('records attempt metrics supplied by throttledFetch', async () => {
        await withTracking({ apiName: 'createReport', region: 'na', itemCount: 300 }, async recordRequestMetrics => {
            recordRequestMetrics({
                amazonRetryAfterMs: null,
                attemptCount: 1,
                governorCooldownMs: 3_600_000,
                rateLimitCount: 1,
                rateLimitRequestId: 'request-123',
                rateLimitResponseContentType: 'text/html',
                rateLimitResponseServer: 'openresty',
                retryCount: 0,
            });
            return { statusCode: 200 };
        });

        expect(recordedValues).toEqual(
            expect.objectContaining({
                amazonRetryAfterMs: null,
                attemptCount: 1,
                governorCooldownMs: 3_600_000,
                rateLimitCount: 1,
                rateLimitRequestId: 'request-123',
                rateLimitResponseContentType: 'text/html',
                rateLimitResponseServer: 'openresty',
                retryCount: 0,
                itemCount: 300,
            })
        );
    });
});
