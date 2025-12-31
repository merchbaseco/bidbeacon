/**
 * Job: Cleanup old AMS metrics records (24h retention)
 * Runs every hour and deletes records older than 24 hours
 */

import { lt } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { amsMetrics } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { withJobSession } from '@/utils/job-events.js';

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
                    },
                    async recorder => {
                        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        await db.delete(amsMetrics).where(lt(amsMetrics.timestamp, cutoff));
                        recorder.setFinalFields({
                            metadata: {
                                cutoff: cutoff.toISOString(),
                            },
                        });
                    }
                )
            )
        );
    });
