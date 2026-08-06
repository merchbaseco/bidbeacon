import { beforeEach, describe, expect, it, vi } from 'vitest';
import { retrieveReport } from '@/amazon-ads/retrieve-report.js';
import { getNextAction } from './state-machine';

vi.mock('@/amazon-ads/retrieve-report.js', () => ({
    retrieveReport: vi.fn(),
}));

describe('report status state machine', () => {
    beforeEach(() => {
        vi.mocked(retrieveReport).mockReset();
    });

    it('stops polling a report Amazon marked as failed', async () => {
        vi.mocked(retrieveReport).mockResolvedValue({
            success: [
                {
                    report: {
                        reportId: 'report-id',
                        status: 'FAILED',
                        failureCode: 'INTERNAL_ERROR',
                        failureReason: 'Report generation failed',
                    },
                },
            ],
        } as Awaited<ReturnType<typeof retrieveReport>>);

        await expect(getNextAction(new Date('2026-07-19T07:00:00.000Z'), 'hourly', 'target', null, 'report-id', 'US')).resolves.toBe('fail');
    });

    it('creates an eligible daily Campaign placement report without enabling hourly placement reports', async () => {
        const periodStart = new Date('2026-07-19T07:00:00.000Z');
        const now = new Date('2026-07-20T07:00:00.000Z');

        await expect(getNextAction(periodStart, 'daily', 'placement', null, null, 'US', now)).resolves.toBe('create');
        await expect(getNextAction(periodStart, 'hourly', 'placement', null, null, 'US', now)).resolves.toBe('none');
    });
});
