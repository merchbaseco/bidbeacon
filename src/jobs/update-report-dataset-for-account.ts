/**
 * Job: Update report_dataset_metadata at the top of every hour.
 * Creates metadata rows for time periods within the retention window.
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { reportDatasetMetadata } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { getNextRefreshTime } from '@/lib/report-status-state-machine/eligibility';
import type { AggregationType, EntityType } from '@/types/reports.js';
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

            const timezone = getTimezoneForCountry(countryCode);
            const now = zonedNow(timezone);

            // Update metadata only for daily target datasets
            // Skip hourly datasets and daily product datasets
            await updateMetadata(accountId, countryCode, now, 'daily', 'target', timezone);

            // Emit event when job completes
            emitEvent({
                type: 'reports:refreshed',
                accountId,
            });
        }
    });

// ============================================================================
// Utility Functions
// ============================================================================

async function upsertMetadata(args: {
    accountId: string;
    countryCode: string;
    timestamp: Date;
    aggregation: AggregationType;
    entityType: EntityType;
    status: 'missing' | 'fetching' | 'parsing' | 'completed' | 'error';
    error?: string | null;
}): Promise<void> {
    const { accountId, countryCode, timestamp, aggregation, entityType, status, error } = args;

    // Calculate next refresh time (no report created yet, so lastReportCreatedAt is null)
    const nextRefreshAt = getNextRefreshTime(timestamp, aggregation, null, countryCode);

    await db
        .insert(reportDatasetMetadata)
        .values({
            accountId,
            countryCode,
            timestamp,
            aggregation,
            entityType,
            status,
            nextRefreshAt,
            reportId: null,
            error: error ?? null,
        })
        .onConflictDoUpdate({
            target: [reportDatasetMetadata.accountId, reportDatasetMetadata.timestamp, reportDatasetMetadata.aggregation, reportDatasetMetadata.entityType],
            set: {
                countryCode,
                status,
                nextRefreshAt,
                error: error ?? null,
            },
        });
}

/**
 * Create a new metadata row for a time period.
 * Used when initially creating rows to maintain the time-based dataset.
 */
async function createMetadataRow(accountId: string, countryCode: string, timestamp: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    await upsertMetadata({
        accountId,
        countryCode,
        timestamp,
        aggregation,
        entityType,
        status: 'missing',
        error: null,
    });
}

/**
 * Check if a metadata record exists for the given account, country code, timestamp, aggregation, and entity type.
 */
async function metadataExists(accountId: string, countryCode: string, timestamp: Date, aggregation: AggregationType, entityType: EntityType): Promise<boolean> {
    const record = await db.query.reportDatasetMetadata.findFirst({
        where: and(
            eq(reportDatasetMetadata.accountId, accountId),
            eq(reportDatasetMetadata.countryCode, countryCode),
            eq(reportDatasetMetadata.timestamp, timestamp),
            eq(reportDatasetMetadata.aggregation, aggregation),
            eq(reportDatasetMetadata.entityType, entityType)
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
async function updateMetadata(accountId: string, countryCode: string, now: Date, aggregation: AggregationType, entityType: EntityType, timezone: string): Promise<void> {
    const isHourly = aggregation === 'hourly';
    const currentPeriodStart = isHourly ? zonedTopOfHour(now, timezone) : zonedStartOfDay(now, timezone);
    const retentionDays = isHourly ? HOURLY_RETENTION_DAYS : DAILY_RETENTION_DAYS;
    const earliestPeriodStart = isHourly ? zonedSubtractHours(currentPeriodStart, retentionDays * 24, timezone) : zonedSubtractDays(currentPeriodStart, retentionDays, timezone);

    // Start from the most recent period and work backwards
    let periodStart = currentPeriodStart;
    const earliestTime = earliestPeriodStart.getTime();

    while (periodStart.getTime() >= earliestTime) {
        // Check if metadata already exists
        if (await metadataExists(accountId, countryCode, periodStart, aggregation, entityType)) {
            // Found existing record - stop here since all earlier periods should also exist
            break;
        }

        // Create metadata row for this time period
        await createMetadataRow(accountId, countryCode, periodStart, aggregation, entityType);

        // Move to the previous period
        periodStart = isHourly ? zonedSubtractHours(periodStart, 1, timezone) : zonedSubtractDays(periodStart, 1, timezone);
    }
}
