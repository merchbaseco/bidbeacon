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
import { withJobSession } from '@/utils/job-events.js';

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
                withJobSession(
                    {
                        jobName: 'summarize-hourly-target-stream',
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
                                summarizeHourlyTargetStreamForAccountJob.emit({
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
                            message: `Queued hourly AMS summarization for ${enabledAccounts.length} accounts`,
                            detail: 'Trailing 24h summaries scheduled',
                        });
                    }
                )
            )
        );
    });
