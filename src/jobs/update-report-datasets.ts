/**
 * Job: Update report datasets for all enabled accounts.
 * Runs every 5 minutes and:
 * 1. Enqueues update-report-dataset-for-account jobs for each enabled accountId/countryCode combination
 * 2. Polls for records due for refresh and enqueues update-report-status jobs
 */

import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { advertiserAccount, reportDatasetMetadata } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { updateReportDatasetForAccountJob } from './update-report-dataset-for-account.js';
import { updateReportStatusJob } from './update-report-status.js';

// ============================================================================
// Job Definition
// ============================================================================

export const updateReportDatasetsJob = boss
    .createJob('update-report-datasets')
    .schedule({
        cron: '*/5 * * * *', // Run every 5 minutes
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
        const accountJobPromises = enabledAccounts.map(async account => {
            const jobId = await updateReportDatasetForAccountJob.emit({
                accountId: account.adsAccountId,
                countryCode: account.countryCode,
            });
            return jobId;
        });

        // Query records due for refresh (only look at rows from the last 10 days)
        // Only process daily target datasets - skip hourly and daily product
        const now = new Date();
        const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
        const dueRecords = await db
            .select()
            .from(reportDatasetMetadata)
            .where(
                and(
                    lte(reportDatasetMetadata.nextRefreshAt, now),
                    eq(reportDatasetMetadata.refreshing, false),
                    gte(reportDatasetMetadata.timestamp, tenDaysAgo),
                    eq(reportDatasetMetadata.aggregation, 'daily'),
                    eq(reportDatasetMetadata.entityType, 'target')
                )
            );

        // Enqueue update-report-status for each due record
        const statusJobPromises = dueRecords.map(async record => {
            const jobId = await updateReportStatusJob.emit({
                accountId: record.accountId,
                countryCode: record.countryCode,
                timestamp: record.timestamp.toISOString(),
                aggregation: record.aggregation as 'hourly' | 'daily',
                entityType: record.entityType as 'target' | 'product',
            });
            return jobId;
        });

        await Promise.all([...accountJobPromises, ...statusJobPromises]);
    });
