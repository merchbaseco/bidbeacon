/**
 * Job: Enqueues summarize-hourly-target-stream-for-account jobs for all enabled accounts.
 * Runs every 15 minutes and enqueues summarize-hourly-target-stream-for-account jobs
 * for each enabled account.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { summarizeHourlyTargetStreamForAccountJob } from './summarize-hourly-target-stream-for-account';
import { withJobMetrics } from '@/utils/job-metrics';

// ============================================================================
// Job Definition
// ============================================================================

export const summarizeHourlyTargetStreamJob = boss
    .createJob('summarize-hourly-target-stream')
    .schedule({
        cron: '*/15 * * * *', // Run every 15 minutes
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'summarize-hourly-target-stream',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async () => {
                        const enabledAccounts = await db
                            .select({
                                adsAccountId: advertiserAccount.adsAccountId,
                                countryCode: advertiserAccount.countryCode,
                            })
                            .from(advertiserAccount)
                            .where(eq(advertiserAccount.enabled, true));

                        await Promise.all(
                            enabledAccounts.map(account =>
                                summarizeHourlyTargetStreamForAccountJob.emit({
                                    accountId: account.adsAccountId,
                                    countryCode: account.countryCode,
                                })
                            )
                        );
                    }
                )
            )
        );
    });
