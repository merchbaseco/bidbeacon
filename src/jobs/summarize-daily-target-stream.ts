/**
 * Job: Enqueues summarize-daily-target-stream-for-account jobs for all enabled accounts.
 * Runs every 15 minutes and enqueues summarize-daily-target-stream-for-account jobs
 * for each enabled account.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { summarizeDailyTargetStreamForAccountJob } from './summarize-daily-target-stream-for-account.js';
import { withJobSession } from '@/utils/job-events.js';

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

                        recorder.setFinalFields({
                            recordsProcessed: enabledAccounts.length,
                            metadata: {
                                accountsEnqueued: enabledAccounts.length,
                            },
                        });

                        await recorder.event({
                            eventType: 'ams-summary',
                            message: `Queued daily AMS summarization for ${enabledAccounts.length} accounts`,
                            detail: 'Summaries run every 15 minutes',
                        });
                    }
                )
            )
        );
    });
