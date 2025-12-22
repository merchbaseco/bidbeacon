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

        // For each enable account, backfill any missing report dataset metadata records.
        const accountJobPromises = enabledAccounts.map(async account => {
            const jobId = await updateReportDatasetForAccountJob.emit({
                accountId: account.adsAccountId,
                countryCode: account.countryCode,
            });
            return jobId;
        });

        // For testing, only move forward with refreshing last 10 days of records.
        // Delete when done testing.
        const now = new Date();
        const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
        const dueRecords = await db
            .select()
            .from(reportDatasetMetadata)
            .where(
                and(
                    lte(reportDatasetMetadata.nextRefreshAt, now),
                    eq(reportDatasetMetadata.refreshing, false), // avoids refreshing the same record multiple times
                    gte(reportDatasetMetadata.timestamp, tenDaysAgo),
                    eq(reportDatasetMetadata.aggregation, 'daily'),
                    eq(reportDatasetMetadata.entityType, 'target')
                )
            );

        // For each record, enqueue an update-report-status job. This job will invoke the state machine
        // for the report dataset to determine the next action.
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
