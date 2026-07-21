import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReport } from '@/amazon-ads/create-report.js';
import { db } from '@/db/index.js';
import { createReportForDataset } from './index';

vi.mock('@/amazon-ads/create-report.js', () => ({
    createReport: vi.fn(),
}));

vi.mock('@/db/index.js', () => ({
    db: {
        query: {
            advertiserAccount: {
                findFirst: vi.fn(),
            },
        },
    },
}));

describe('createReportForDataset', () => {
    const createReportMock = vi.mocked(createReport);
    const findFirstMock = vi.mocked(db.query.advertiserAccount.findFirst);

    beforeEach(() => {
        createReportMock.mockReset();
        findFirstMock.mockReset();

        findFirstMock.mockResolvedValue({ adsAccountId: 'amzn-account' });
        createReportMock.mockResolvedValue({
            success: [{ report: { reportId: 'report-123' } }],
        } as Awaited<ReturnType<typeof createReport>>);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('formats report dates in the account timezone (JST)', async () => {
        const reportId = await createReportForDataset({
            accountId: 'amzn-account',
            countryCode: 'JP',
            timestamp: '2026-01-04T15:00:00.000Z',
            aggregation: 'daily',
            entityType: 'target',
        });

        expect(reportId).toBe('report-123');
        const request = createReportMock.mock.calls[0]?.[0];
        const datePeriod = request?.reports?.[0]?.periods?.[0]?.datePeriod;

        expect(datePeriod).toEqual({
            startDate: '2026-01-05',
            endDate: '2026-01-05',
        });
    });

    it('prioritizes fresh periods ahead of historical backfills', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-05T12:00:00.000Z'));

        await createReportForDataset({
            accountId: 'amzn-account',
            countryCode: 'US',
            timestamp: '2026-01-04T12:00:00.000Z',
            aggregation: 'hourly',
            entityType: 'target',
        });
        await createReportForDataset({
            accountId: 'amzn-account',
            countryCode: 'US',
            timestamp: '2025-11-01T12:00:00.000Z',
            aggregation: 'daily',
            entityType: 'target',
        });

        expect(createReportMock.mock.calls[0]?.[2]).toBe(0);
        expect(createReportMock.mock.calls[1]?.[2]).toBe(8);
    });
});
