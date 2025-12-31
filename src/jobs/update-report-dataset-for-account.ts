import { and, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
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
        const metadataEntries: Array<{
            accountId: string;
            countryCode: string;
            dailyEnqueuedCount: number;
            hourlyEnqueuedCount: number;
        }> = [];

        for (const job of jobs) {
            const { accountId, countryCode } = job.data;

            const timezone = getTimezoneForCountry(countryCode);
            const now = zonedNow(timezone);

            // Insert missing metadata records for daily target datasets within retention period
            await insertMissingMetadataRecords(accountId, countryCode, now, 'daily', 'target', timezone);

            // Insert missing metadata records for hourly target datasets within retention period
            await insertMissingMetadataRecords(accountId, countryCode, now, 'hourly', 'target', timezone);

            // Enqueue update-report-status jobs for any rows that are due for refresh
            const dailyEnqueuedCount = await enqueueUpdateReportStatusJobs(accountId, countryCode, now, 'daily', 'target');

            const hourlyEnqueuedCount = await enqueueUpdateReportStatusJobs(accountId, countryCode, now, 'hourly', 'target');

            // Emit event when job completes
            emitEvent({
                type: 'reports:refreshed',
                accountId,
            });

            metadataEntries.push({
                accountId,
                countryCode,
                dailyEnqueuedCount,
                hourlyEnqueuedCount,
            });
        }

        if (metadataEntries.length > 0) {
            return {
                metadata: {
                    accounts: metadataEntries,
                },
            };
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

    const totalPeriods = isHourly ? retentionDays * 24 : retentionDays;

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

    await db
        .insert(reportDatasetMetadata)
        .values({
            accountId,
            countryCode,
            periodStart,
            aggregation,
            entityType,
            status,
            nextRefreshAt: getNextRefreshTime({ reportId: null, periodStart, aggregation, lastReportCreatedAt: null, countryCode }),
            reportId: null,
            error: error ?? null,
        })
        .onConflictDoNothing({
            target: [reportDatasetMetadata.accountId, reportDatasetMetadata.periodStart, reportDatasetMetadata.aggregation, reportDatasetMetadata.entityType],
        });
}

/**
 * Enqueue update-report-status jobs for records that are due for refresh.
 *
 * We only enqueue jobs such that the total number of concurrent jobs is less than MAX_CONCURRENT_REPORTS.
 * If already at capacity, the function returns early without enqueueing any more jobs.
 *
 * Eligible rows are sorted to prioritize rows with report IDs (in-progress reports that need continued
 * processing), then by most recent period, then by nextRefreshAt. This ensures rows with report IDs always
 * get included before the limit is applied.
 */
async function enqueueUpdateReportStatusJobs(accountId: string, countryCode: string, now: Date, aggregation: AggregationType, entityType: EntityType): Promise<number> {
    const MAX_CONCURRENT_REPORTS = 5;

    // Enqueue update-report-status jobs for records that already have a reportId and nextRefreshAt
    // is overdue..
    const recordsWithActiveReport = await db
        .select()
        .from(reportDatasetMetadata)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.countryCode, countryCode),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType),
                isNotNull(reportDatasetMetadata.reportId),
                lte(reportDatasetMetadata.nextRefreshAt, now)
            )
        )
        .orderBy(desc(reportDatasetMetadata.periodStart));

    // Enqueue update-report-status jobs for records that do not have a reportId, but are
    // overdue.
    const recordsDueForNewReport = await db
        .select()
        .from(reportDatasetMetadata)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.countryCode, countryCode),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType),
                eq(reportDatasetMetadata.refreshing, false),
                isNull(reportDatasetMetadata.reportId),
                lte(reportDatasetMetadata.nextRefreshAt, now)
            )
        )
        .orderBy(desc(reportDatasetMetadata.periodStart))
        .limit(Math.max(0, MAX_CONCURRENT_REPORTS - recordsWithActiveReport.length));

    const recordsNeedingWork = [...recordsWithActiveReport, ...recordsDueForNewReport];
    if (recordsNeedingWork.length === 0) {
        return 0;
    }

    const jobIds = await Promise.all(
        recordsNeedingWork.map(record =>
            updateReportStatusJob.emit({
                accountId: record.accountId,
                countryCode: record.countryCode,
                timestamp: record.periodStart.toISOString(),
                aggregation: record.aggregation as 'hourly' | 'daily',
                entityType: record.entityType as 'target' | 'product',
            })
        )
    );

    return jobIds.length;
}
