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

// ============================================================================
// Job Definition
// ============================================================================

export const summarizeDailyTargetStreamJob = boss
    .createJob('summarize-daily-target-stream')
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

        // Enqueue a separate job to summarize daily target stream for each enabled account
        const accountJobPromises = enabledAccounts.map(async account => {
            const jobId = await summarizeDailyTargetStreamForAccountJob.emit({
                accountId: account.adsAccountId,
                countryCode: account.countryCode,
            });
            return jobId;
        });

        await Promise.all(accountJobPromises);
    });
