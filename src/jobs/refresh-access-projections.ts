import { ServiceAccessError } from '@merchbaseco/access';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { accessProjection } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { getBidBeaconAccess } from '@/services/access/bidbeacon-access';
import { withJobMetrics } from '@/utils/job-metrics';

export type AccessProjectionRefreshResult = {
    merchbaseUserId: string;
    refreshed: boolean;
    reason?: string;
};

export const refreshActiveAccessProjections = async (input: {
    merchbaseUserIds: string[];
    refreshAccess: (merchbaseUserId: string) => Promise<unknown>;
    onFailure?: (merchbaseUserId: string, error: unknown) => void;
}): Promise<AccessProjectionRefreshResult[]> => {
    const results: AccessProjectionRefreshResult[] = [];
    for (const merchbaseUserId of input.merchbaseUserIds) {
        try {
            await input.refreshAccess(merchbaseUserId);
            results.push({ merchbaseUserId, refreshed: true });
        } catch (error) {
            input.onFailure?.(merchbaseUserId, error);
            results.push({
                merchbaseUserId,
                reason: error instanceof ServiceAccessError ? error.code : 'refresh_failed',
                refreshed: false,
            });
        }
    }
    return results;
};

export const refreshAccessProjectionsJob = boss
    .createJob('refresh-access-projections')
    .schedule({
        cron: '0 4 * * *',
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'refresh-access-projections',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async recorder => {
                        const rows = await db.selectDistinct({ merchbaseUserId: accessProjection.merchbaseUserId }).from(accessProjection).where(eq(accessProjection.state, 'active'));
                        const merchbaseUserIds = rows.flatMap(row => (row.merchbaseUserId ? [row.merchbaseUserId] : []));
                        const access = getBidBeaconAccess();
                        const results = await refreshActiveAccessProjections({
                            merchbaseUserIds,
                            onFailure: (merchbaseUserId, error) => {
                                recorder.addEvent({
                                    message: 'Access projection refresh failed; continuing with remaining identities.',
                                    payload: {
                                        merchbaseUserId,
                                        reason: error instanceof ServiceAccessError ? error.code : 'refresh_failed',
                                    },
                                });
                            },
                            refreshAccess: merchbaseUserId => access.sessionAccess.refreshAccess(merchbaseUserId),
                        });

                        recorder.addEvent({
                            message: 'Refreshed active Merchbase Access projections.',
                            payload: {
                                refreshedCount: results.filter(result => result.refreshed).length,
                                failedCount: results.filter(result => !result.refreshed).length,
                                projectionCount: results.length,
                            },
                        });
                    }
                )
            )
        );
        return undefined;
    });
