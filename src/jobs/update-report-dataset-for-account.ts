/**
 * Job: Update report_dataset_metadata at the top of every hour.
 * Uses performance table as a proxy for whether data has landed for the window.
 */

import { and, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { performance, reportDatasetMetadata } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { zonedNow, zonedStartOfDay, zonedSubtractDays, zonedSubtractHours, zonedTopOfHour } from '@/utils/date.js';
import { emitEvent } from '@/utils/events.js';
import { getTimezoneForCountry } from '@/utils/timezones.js';

// Amazon Ads API data retention periods
const HOURLY_RETENTION_DAYS = 14;
const DAILY_RETENTION_MONTHS = 15;
const DAILY_RETENTION_DAYS = DAILY_RETENTION_MONTHS * 30; // Approximate: 15 months * 30 days

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
});

export const updateReportDatasetForAccountJob = boss
    .createJob('update-report-dataset-for-account')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const job of jobs) {
            const { accountId, countryCode } = job.data;

            console.log(`[Update Report Dataset Metadata] Starting job (ID: ${job.id}) for account: ${accountId}, country: ${countryCode}`);
            const timezone = getTimezoneForCountry(countryCode);
            const now = zonedNow(timezone);

            // Update hourly metadata for the past 14 days
            await updateMetadata(accountId, countryCode, now, 'hourly', timezone);

            // Update daily metadata for the past 15 months
            await updateMetadata(accountId, countryCode, now, 'daily', timezone);

            // Emit event when job completes
            emitEvent({
                type: 'reports:refreshed',
                accountId,
            });
            console.log(`[Update Report Dataset Metadata] Completed job (ID: ${job.id}) for account: ${accountId}, country: ${countryCode}`);
        }
    });

// ============================================================================
// Utility Functions
// ============================================================================

async function _hasPerformanceData(accountId: string, windowStart: Date, windowEnd: Date, aggregation: 'hourly' | 'daily'): Promise<boolean> {
    const record = await db.query.performance.findFirst({
        where: and(eq(performance.accountId, accountId), eq(performance.aggregation, aggregation), gte(performance.date, windowStart), lt(performance.date, windowEnd)),
        columns: { accountId: true },
    });

    return Boolean(record);
}

async function upsertMetadata(args: {
    accountId: string;
    countryCode: string;
    timestamp: Date;
    aggregation: 'hourly' | 'daily';
    status: 'missing' | 'fetching' | 'completed' | 'failed';
    lastRefreshed: Date;
    error?: string | null;
}): Promise<void> {
    const { accountId, countryCode, timestamp, aggregation, status, lastRefreshed, error } = args;

    await db
        .insert(reportDatasetMetadata)
        .values({
            accountId,
            countryCode,
            timestamp,
            aggregation,
            status,
            lastRefreshed,
            reportId: null,
            error: error ?? null,
        })
        .onConflictDoUpdate({
            target: [reportDatasetMetadata.accountId, reportDatasetMetadata.timestamp, reportDatasetMetadata.aggregation],
            set: {
                countryCode,
                status,
                lastRefreshed,
                error: error ?? null,
            },
        });
}

/**
 * Create a new metadata row for a time period.
 * Used when initially creating rows to maintain the time-based dataset.
 */
async function createMetadataRow(accountId: string, countryCode: string, timestamp: Date, aggregation: 'hourly' | 'daily'): Promise<void> {
    const timezone = getTimezoneForCountry(countryCode);

    await upsertMetadata({
        accountId,
        countryCode,
        timestamp,
        aggregation,
        status: 'missing',
        lastRefreshed: zonedNow(timezone),
        error: null,
    });
}

/**
 * Check if a metadata record exists for the given account, country code, timestamp, and aggregation.
 */
async function metadataExists(accountId: string, countryCode: string, timestamp: Date, aggregation: 'hourly' | 'daily'): Promise<boolean> {
    const record = await db.query.reportDatasetMetadata.findFirst({
        where: and(
            eq(reportDatasetMetadata.accountId, accountId),
            eq(reportDatasetMetadata.countryCode, countryCode),
            eq(reportDatasetMetadata.timestamp, timestamp),
            eq(reportDatasetMetadata.aggregation, aggregation)
        ),
        columns: { accountId: true },
    });

    return Boolean(record);
}

/**
 * Update metadata records within the retention period.
 * Creates rows starting from the most recent period and working backwards,
 * stopping when existing records are found or the retention limit is reached.
 */
async function updateMetadata(accountId: string, countryCode: string, now: Date, aggregation: 'hourly' | 'daily', timezone: string): Promise<void> {
    const currentPeriodStart = aggregation === 'hourly' ? zonedTopOfHour(now, timezone) : zonedStartOfDay(now, timezone);
    const retentionDays = aggregation === 'hourly' ? HOURLY_RETENTION_DAYS : DAILY_RETENTION_DAYS;
    const earliestPeriodStart = aggregation === 'hourly' ? zonedSubtractHours(currentPeriodStart, retentionDays * 24, timezone) : zonedSubtractDays(currentPeriodStart, retentionDays, timezone);

    // Start from the most recent period and work backwards
    let periodStart = currentPeriodStart;
    const earliestTime = earliestPeriodStart.getTime();

    while (periodStart.getTime() >= earliestTime) {
        // Check if metadata already exists
        if (await metadataExists(accountId, countryCode, periodStart, aggregation)) {
            // Found existing record - stop here since all earlier periods should also exist
            break;
        }

        // Create metadata row for this time period
        await createMetadataRow(accountId, countryCode, periodStart, aggregation);

        // Move to the previous period
        periodStart = aggregation === 'hourly' ? zonedSubtractHours(periodStart, 1, timezone) : zonedSubtractDays(periodStart, 1, timezone);
    }
}
