/**
 * Job: Enqueues summarize-daily-target-stream-for-account jobs for all enabled accounts.
 * Runs every 15 minutes and enqueues summarize-daily-target-stream-for-account jobs
 * for each enabled account.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { summarizeDailyTargetStreamForAccountJob } from './summarize-daily-target-stream-for-account';
import { withJobSession } from '@/utils/job-sessions';

// ============================================================================
// Job Definition
// ============================================================================

export const summarizeDailyTargetStreamJob = boss
    .createJob('summarize-daily-target-stream')
    .schedule({
        cron: '*/15 * * * *', // Run every 15 minutes
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobSession(
                    {
                        jobName: 'summarize-daily-target-stream',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async recorder => {
                        const enabledAccounts = await db
                            .select({
                                adsAccountId: advertiserAccount.adsAccountId,
                                countryCode: advertiserAccount.countryCode,
                            })
                            .from(advertiserAccount)
                            .where(eq(advertiserAccount.enabled, true));

                        await Promise.all(
                            enabledAccounts.map(account =>
                                summarizeDailyTargetStreamForAccountJob.emit({
                                    accountId: account.adsAccountId,
                                    countryCode: account.countryCode,
                                })
                            )
                        );

                        await recorder.addAction({
                            type: 'ams-summary-enqueue',
                            cadence: 'daily',
                            accountsEnqueued: enabledAccounts.length,
                        });
                    }
                )
            )
        );
    });
