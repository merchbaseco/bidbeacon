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

// ============================================================================
// Job Definition
// ============================================================================

export const summarizeHourlyTargetStreamJob = boss
    .createJob('summarize-hourly-target-stream')
    .schedule({
        cron: '*/15 * * * *', // Run every 15 minutes
    })
    .work(async () => {
        // Query all enabled advertiser accounts
        const enabledAccounts = await db
            .select({
                adsAccountId: advertiserAccount.adsAccountId,
                countryCode: advertiserAccount.countryCode,
            })
            .from(advertiserAccount)
            .where(eq(advertiserAccount.enabled, true));

        // Enqueue a separate job to summarize hourly target stream for each enabled account
        const accountJobPromises = enabledAccounts.map(async account => {
            const jobId = await summarizeHourlyTargetStreamForAccountJob.emit({
                accountId: account.adsAccountId,
                countryCode: account.countryCode,
            });
            return jobId;
        });

        await Promise.all(accountJobPromises);
    });

