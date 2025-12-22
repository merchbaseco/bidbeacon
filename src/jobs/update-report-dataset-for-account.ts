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
//
// This job backfills the report_dataset_metadata table for a given account
// and country code.
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

            // Insert missing metadata records for daily target datasets within retention period
            // Skip hourly datasets and daily product datasets
            await insertMissingMetadataRecords(accountId, countryCode, now, 'daily', 'target', timezone);

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
/**
 * Insert missing metadata records within the retention period.
 * Creates missing rows starting from the most recent period and working backwards
 * until the retention limit is reached. Existing records are ignored via onConflictDoNothing.
 */
async function insertMissingMetadataRecords(accountId: string, countryCode: string, now: Date, aggregation: AggregationType, entityType: EntityType, timezone: string): Promise<void> {
    const isHourly = aggregation === 'hourly';
    const currentPeriodStart = isHourly ? zonedTopOfHour(now, timezone) : zonedStartOfDay(now, timezone);
    const retentionDays = isHourly ? HOURLY_RETENTION_DAYS : DAILY_RETENTION_DAYS;
    const earliestPeriodStart = isHourly ? zonedSubtractHours(currentPeriodStart, retentionDays * 24, timezone) : zonedSubtractDays(currentPeriodStart, retentionDays, timezone);

    // Start from the most recent period and work backwards
    let periodStart = currentPeriodStart;
    const earliestTime = earliestPeriodStart.getTime();

    while (periodStart.getTime() >= earliestTime) {
        // Insert metadata row for this time period (ignores if already exists)
        await insertMetadata({
            accountId,
            countryCode,
            timestamp: periodStart,
            aggregation,
            entityType,
            status: 'missing',
            error: null,
        });

        // Move to the previous period
        periodStart = isHourly ? zonedSubtractHours(periodStart, 1, timezone) : zonedSubtractDays(periodStart, 1, timezone);
    }
}

async function insertMetadata(args: {
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
        .onConflictDoNothing({
            target: [reportDatasetMetadata.accountId, reportDatasetMetadata.timestamp, reportDatasetMetadata.aggregation, reportDatasetMetadata.entityType],
        });
}
