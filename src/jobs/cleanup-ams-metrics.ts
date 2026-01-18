/**
 * Job: Cleanup old AMS metrics records (24h retention)
 * Runs every hour and deletes records older than 24 hours
 */

import { lt } from 'drizzle-orm';
import { db } from '@/db/index';
import { amsMetrics } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { withJobMetrics } from '@/utils/job-metrics';

// ============================================================================
// Job Definition
// ============================================================================

export const cleanupAmsMetricsJob = boss
    .createJob('cleanup-ams-metrics')
    .schedule({
        cron: '0 * * * *', // Run every hour
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'cleanup-ams-metrics',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async recorder => {
                        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        const deletedRows = await db.delete(amsMetrics).where(lt(amsMetrics.timestamp, cutoff)).returning({ id: amsMetrics.id });
                        const deletedCount = deletedRows.length;
                        recorder.addEvent({
                            message: `Deleted ${deletedCount} AMS metrics rows (before ${cutoff.toISOString()}).`,
                            payload: {
                                deletedCount,
                                cutoff: cutoff.toISOString(),
                            },
                        });
                    }
                )
            )
        );
    });
