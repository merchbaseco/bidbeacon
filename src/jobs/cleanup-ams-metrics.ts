/**
 * Job: Cleanup old AMS metrics records (24h retention)
 * Runs every hour and deletes records older than 24 hours
 */

import { lt } from 'drizzle-orm';
import { db } from '@/db/index';
import { amsMetrics } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { withJobSession } from '@/utils/job-sessions';

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
                withJobSession(
                    {
                        jobName: 'cleanup-ams-metrics',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async recorder => {
                        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        await db.delete(amsMetrics).where(lt(amsMetrics.timestamp, cutoff));
                        await recorder.addAction({
                            type: 'cleanup-ams-metrics',
                            cutoff: cutoff.toISOString(),
                        });
                    }
                )
            )
        );
    });
