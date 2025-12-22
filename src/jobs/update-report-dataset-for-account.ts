import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { reportDatasetMetadata } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { getNextRefreshTime } from '@/lib/report-status-state-machine/eligibility';
import type { AggregationType, EntityType } from '@/types/reports.js';
import { zonedNow, zonedStartOfDay, zonedSubtractDays, zonedSubtractHours, zonedTopOfHour } from '@/utils/date.js';
import { emitEvent } from '@/utils/events.js';
import { getTimezoneForCountry } from '@/utils/timezones.js';
import { updateReportStatusJob } from './update-report-status.js';

// Amazon Ads API data retention periods
const HOURLY_RETENTION_DAYS = 14;
const DAILY_RETENTION_MONTHS = 15;
const DAILY_RETENTION_DAYS = DAILY_RETENTION_MONTHS * 30; // Approximate: 15 months * 30 days

// ============================================================================
// Job Definition
//
// This job backfills any missing rows into the report_dataset_metadata table
// for a given account and country code, and then enqueues update-report-status
// for any rows that are due for refresh.
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

            // Enqueue update-report-status jobs for any rows that are due for refresh
            await enqueueUpdateReportStatusJobs(accountId, countryCode, now, 'daily', 'target');

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
            periodStart,
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
    periodStart: Date;
    aggregation: AggregationType;
    entityType: EntityType;
    status: 'missing' | 'fetching' | 'parsing' | 'completed' | 'error';
    error?: string | null;
}): Promise<void> {
    const { accountId, countryCode, periodStart, aggregation, entityType, status, error } = args;

    // Calculate next refresh time (no report created yet, so lastReportCreatedAt is null and reportId is null)
    const nextRefreshAt = getNextRefreshTime({
        periodStart,
        aggregation,
        lastReportCreatedAt: null,
        reportId: null,
        countryCode,
    });

    await db
        .insert(reportDatasetMetadata)
        .values({
            accountId,
            countryCode,
            periodStart,
            aggregation,
            entityType,
            status,
            nextRefreshAt,
            reportId: null,
            error: error ?? null,
        })
        .onConflictDoNothing({
            target: [reportDatasetMetadata.accountId, reportDatasetMetadata.periodStart, reportDatasetMetadata.aggregation, reportDatasetMetadata.entityType],
        });
}

/**
 * Enqueue update-report-status jobs for records that are due for refresh.
 * Queries for records where nextRefreshAt has passed and refreshing is false,
 * filtered by the specific account, aggregation, and entity type.
 *
 * For testing, only processes records from the last 10 days.
 * TODO: Remove the 10 day limitation when done testing.
 */
async function enqueueUpdateReportStatusJobs(accountId: string, countryCode: string, now: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    // For testing, only move forward with refreshing last 10 days of records.
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const dueRecords = await db
        .select()
        .from(reportDatasetMetadata)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.countryCode, countryCode),
                lte(reportDatasetMetadata.nextRefreshAt, now),
                eq(reportDatasetMetadata.refreshing, false), // avoids refreshing the same record multiple times
                gte(reportDatasetMetadata.periodStart, tenDaysAgo),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType)
            )
        );

    // For each record, first market it as refreshing.
    await db
        .update(reportDatasetMetadata)
        .set({ refreshing: true })
        .where(
            inArray(
                reportDatasetMetadata.accountId,
                dueRecords.map(record => record.accountId)
            )
        );

    // Then, enqueue an update-report-status job. This job will invoke the state machine
    // for the given dataset to determine the next action.
    const statusJobPromises = dueRecords.map(async record => {
        const jobId = await updateReportStatusJob.emit({
            accountId: record.accountId,
            countryCode: record.countryCode,
            timestamp: record.periodStart.toISOString(),
            aggregation: record.aggregation as 'hourly' | 'daily',
            entityType: record.entityType as 'target' | 'product',
        });
        return jobId;
    });

    await Promise.all(statusJobPromises);
}
