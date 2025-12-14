/**
 * Job: Update report_dataset_metadata at the top of every hour.
 * Uses performance table as a proxy for whether data has landed for the window.
 */

import { and, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { performance, reportDatasetMetadata } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import {
    enumerateUtcDays,
    enumerateUtcHours,
    isUtcStartOfDay,
    utcAddDays,
    utcAddHours,
    utcNow,
    utcPreviousDayStart,
    utcPreviousHourStart,
    utcStartOfDay,
    utcSubtractDays,
    utcSubtractHours,
    utcTopOfHour,
} from '@/utils/date.js';
import { emitEvent } from '@/utils/events.js';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';

// Amazon Ads API data retention periods
const HOURLY_RETENTION_DAYS = 14;
const DAILY_RETENTION_MONTHS = 15;
const DAILY_RETENTION_DAYS = DAILY_RETENTION_MONTHS * 30; // Approximate: 15 months * 30 days

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({
    accountId: z.string().optional(),
});

export const updateReportDatasetMetadataJob = boss
    .createJob('update-report-dataset-metadata')
    .input(jobInputSchema)
    .schedule({
        cron: '0 * * * *', // Top of every hour
        data: { accountId: DEFAULT_ACCOUNT_ID },
    })
    .work(async jobs => {
        for (const job of jobs) {
            const accountId = job.data.accountId ?? DEFAULT_ACCOUNT_ID;
            console.log(`[Update Report Dataset Metadata] Starting job (ID: ${job.id}) for account: ${accountId}`);
            const now = utcNow();
            const hourStart = utcTopOfHour(now);

            // Update the metadata for the most recent completed hour (the hour that just ended)
            const previousHourStart = utcPreviousHourStart(now);
            await updateForWindow(accountId, previousHourStart, 'hourly');

            // Backfill missing hourly metadata within retention period
            await backfillMissingMetadata(accountId, now, 'hourly');

            // Once per day (at 00:00 UTC) also update the previous day's daily aggregation
            if (isUtcStartOfDay(hourStart)) {
                const previousDayStart = utcPreviousDayStart(now);
                await updateForWindow(accountId, previousDayStart, 'daily');

                // Backfill missing daily metadata within retention period
                await backfillMissingMetadata(accountId, now, 'daily');
            }

            // Emit event when job completes
            emitEvent({
                type: 'reports:refreshed',
                accountId,
            });
            console.log(`[Update Report Dataset Metadata] Completed job (ID: ${job.id}) for account: ${accountId}`);
        }
    });

const reprocessJobInputSchema = z.object({
    accountId: z.string(),
    timestamp: z.string(), // ISO string
    aggregation: z.enum(['hourly', 'daily']),
});

export const reprocessReportDatasetMetadataJob = boss
    .createJob('reprocess-report-dataset-metadata')
    .input(reprocessJobInputSchema)
    .work(async jobs => {
        for (const job of jobs) {
            const { accountId, timestamp, aggregation } = job.data;
            console.log(`[Reprocess Report Dataset Metadata] Starting job (ID: ${job.id}): ${aggregation} for ${accountId} at ${timestamp}`);
            const windowStart = new Date(timestamp);
            await updateForWindow(accountId, windowStart, aggregation);
            console.log(`[Reprocess Report Dataset Metadata] Completed job (ID: ${job.id})`);
        }
    });

// ============================================================================
// Utility Functions
// ============================================================================

async function hasPerformanceData(accountId: string, windowStart: Date, windowEnd: Date, aggregation: 'hourly' | 'daily'): Promise<boolean> {
    const record = await db.query.performance.findFirst({
        where: and(eq(performance.accountId, accountId), eq(performance.aggregation, aggregation), gte(performance.date, windowStart), lt(performance.date, windowEnd)),
        columns: { accountId: true },
    });

    return Boolean(record);
}

async function upsertMetadata(args: {
    accountId: string;
    timestamp: Date;
    aggregation: 'hourly' | 'daily';
    status: 'missing' | 'fetching' | 'completed' | 'failed';
    reportId: string;
    lastRefreshed: Date;
    error?: string | null;
}): Promise<void> {
    const { accountId, timestamp, aggregation, status, reportId, lastRefreshed, error } = args;

    await db
        .insert(reportDatasetMetadata)
        .values({
            accountId,
            timestamp,
            aggregation,
            status,
            lastRefreshed,
            reportId,
            error: error ?? null,
        })
        .onConflictDoUpdate({
            target: [reportDatasetMetadata.accountId, reportDatasetMetadata.timestamp, reportDatasetMetadata.aggregation],
            set: {
                status,
                lastRefreshed,
                reportId,
                error: error ?? null,
            },
        });
}

async function updateForWindow(accountId: string, windowStart: Date, aggregation: 'hourly' | 'daily'): Promise<void> {
    const windowEnd = aggregation === 'hourly' ? utcAddHours(windowStart, 1) : utcAddDays(windowStart, 1);
    const hasData = await hasPerformanceData(accountId, windowStart, windowEnd, aggregation);

    const status = hasData ? 'completed' : 'missing';
    const error = hasData ? null : 'No performance data found for this window';
    const reportId = `${aggregation}-${windowStart.toISOString()}`;

    await upsertMetadata({
        accountId,
        timestamp: windowStart,
        aggregation,
        status,
        reportId,
        lastRefreshed: utcNow(),
        error,
    });
}

/**
 * Check if a metadata record exists for the given account, timestamp, and aggregation.
 */
async function metadataExists(accountId: string, timestamp: Date, aggregation: 'hourly' | 'daily'): Promise<boolean> {
    const record = await db.query.reportDatasetMetadata.findFirst({
        where: and(eq(reportDatasetMetadata.accountId, accountId), eq(reportDatasetMetadata.timestamp, timestamp), eq(reportDatasetMetadata.aggregation, aggregation)),
        columns: { accountId: true },
    });

    return Boolean(record);
}

/**
 * Backfill missing metadata records within the retention period.
 * Creates records for any missing hours/days that don't have metadata yet.
 */
async function backfillMissingMetadata(accountId: string, now: Date, aggregation: 'hourly' | 'daily'): Promise<void> {
    const currentPeriodStart = aggregation === 'hourly' ? utcTopOfHour(now) : utcStartOfDay(now);
    const retentionDays = aggregation === 'hourly' ? HOURLY_RETENTION_DAYS : DAILY_RETENTION_DAYS;
    const earliestPeriodStart = aggregation === 'hourly' ? utcSubtractHours(currentPeriodStart, retentionDays * 24) : utcSubtractDays(currentPeriodStart, retentionDays);

    // Iterate through all periods in the retention window
    const periods = aggregation === 'hourly' ? enumerateUtcHours(earliestPeriodStart, currentPeriodStart) : enumerateUtcDays(earliestPeriodStart, currentPeriodStart);

    for (const periodStart of periods) {
        // Skip if metadata already exists
        if (await metadataExists(accountId, periodStart, aggregation)) {
            continue;
        }

        // Create metadata record (will check for data and set status accordingly)
        await updateForWindow(accountId, periodStart, aggregation);
    }
}
