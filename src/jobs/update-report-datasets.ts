/**
 * Job: Update report datasets for all enabled accounts.
 * Runs every 10 minutes and enqueues update-report-dataset-for-account jobs
 * for each enabled accountId/countryCode combination.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { updateReportDatasetForAccountJob } from './update-report-dataset-for-account.js';

// ============================================================================
// Job Definition
// ============================================================================

export const updateReportDatasetsJob = boss
    .createJob('update-report-datasets')
    .schedule({
        cron: '*/10 * * * *', // Run every 10 minutes
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

        // Enqueue update-report-dataset-for-account job for each account
        const jobPromises = enabledAccounts.map(async account => {
            const jobId = await updateReportDatasetForAccountJob.emit({
                accountId: account.adsAccountId,
                countryCode: account.countryCode,
            });
            return jobId;
        });

        await Promise.all(jobPromises);
    });
