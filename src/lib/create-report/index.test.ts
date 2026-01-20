import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createReportForDataset } from './index';
import { createReport } from '@/amazon-ads/create-report.js';
import { db } from '@/db/index.js';

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
});
