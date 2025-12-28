import { and, count, desc, eq, inArray, isNotNull, lte, or } from 'drizzle-orm';
import type { Logger } from 'pino';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { reportDatasetMetadata } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { getNextRefreshTime } from '@/lib/report-status-state-machine/eligibility';
import type { AggregationType, EntityType } from '@/types/reports.js';
import { zonedNow, zonedStartOfDay, zonedSubtractDays, zonedSubtractHours, zonedTopOfHour } from '@/utils/date.js';
import { emitEvent } from '@/utils/events.js';
import { createJobLogger } from '@/utils/logger';
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

            const logger = createJobLogger('update-report-dataset-for-account', job.id, {
                accountId,
                countryCode,
            });

            logger.info('Starting job');

            const timezone = getTimezoneForCountry(countryCode);
            const now = zonedNow(timezone);

            logger.info({ timezone, now: now.toISOString() }, 'Resolved timezone and current time');

            // Insert missing metadata records for daily target datasets within retention period
            logger.info('Inserting missing metadata records for daily/target');
            await insertMissingMetadataRecords(accountId, countryCode, now, 'daily', 'target', timezone, logger);

            // Insert missing metadata records for hourly target datasets within retention period
            logger.info('Inserting missing metadata records for hourly/target');
            await insertMissingMetadataRecords(accountId, countryCode, now, 'hourly', 'target', timezone, logger);

            // Enqueue update-report-status jobs for any rows that are due for refresh
            logger.info('Enqueuing update-report-status jobs for daily/target');
            await enqueueUpdateReportStatusJobs(accountId, countryCode, now, 'daily', 'target', logger);

            logger.info('Enqueuing update-report-status jobs for hourly/target');
            await enqueueUpdateReportStatusJobs(accountId, countryCode, now, 'hourly', 'target', logger);

            // Emit event when job completes
            emitEvent({
                type: 'reports:refreshed',
                accountId,
            });

            logger.info('Job completed successfully');
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
async function insertMissingMetadataRecords(accountId: string, countryCode: string, now: Date, aggregation: AggregationType, entityType: EntityType, timezone: string, logger: Logger): Promise<void> {
    const isHourly = aggregation === 'hourly';
    const currentPeriodStart = isHourly ? zonedTopOfHour(now, timezone) : zonedStartOfDay(now, timezone);
    const retentionDays = isHourly ? HOURLY_RETENTION_DAYS : DAILY_RETENTION_DAYS;
    const earliestPeriodStart = isHourly ? zonedSubtractHours(currentPeriodStart, retentionDays * 24, timezone) : zonedSubtractDays(currentPeriodStart, retentionDays, timezone);

    const totalPeriods = isHourly ? retentionDays * 24 : retentionDays;

    logger.info(
        {
            aggregation,
            entityType,
            currentPeriodStart: currentPeriodStart.toISOString(),
            earliestPeriodStart: earliestPeriodStart.toISOString(),
            retentionDays,
            totalPeriods,
        },
        'Calculated retention period range'
    );

    // Start from the most recent period and work backwards
    let periodStart = currentPeriodStart;
    const earliestTime = earliestPeriodStart.getTime();
    let insertedCount = 0;

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
        insertedCount++;

        // Move to the previous period
        periodStart = isHourly ? zonedSubtractHours(periodStart, 1, timezone) : zonedSubtractDays(periodStart, 1, timezone);
    }

    logger.info({ aggregation, entityType, insertedCount }, 'Finished inserting missing metadata records (conflicts ignored)');
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
            nextRefreshAt: getNextRefreshTime({ reportId: null, periodStart, aggregation, lastReportCreatedAt: null }),
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
async function enqueueUpdateReportStatusJobs(accountId: string, countryCode: string, now: Date, aggregation: AggregationType, entityType: EntityType, logger: Logger): Promise<void> {
    const MAX_CONCURRENT_REPORTS = 5;

    // Count how many datasets are currently refreshing for this account/country/aggregation/entityType
    const [refreshingCountResult] = await db
        .select({ count: count() })
        .from(reportDatasetMetadata)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.countryCode, countryCode),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType),
                eq(reportDatasetMetadata.refreshing, true)
            )
        );

    const refreshingCount = refreshingCountResult?.count ?? 0;
    const adjustedLimit = Math.max(0, MAX_CONCURRENT_REPORTS - refreshingCount);

    logger.info(
        {
            aggregation,
            entityType,
            refreshingCount,
            maxConcurrent: MAX_CONCURRENT_REPORTS,
            adjustedLimit,
            now: now.toISOString(),
        },
        'Checked current refreshing count'
    );

    // If we're already at max capacity, don't query for more records
    if (adjustedLimit === 0) {
        logger.info({ aggregation, entityType }, 'At max capacity, skipping enqueue');
        return;
    }

    // Get eligible rows. Include rows that are either:
    // 1. Have a reportId (in-progress reports that need continued processing)
    // 2. Due for refresh (nextRefreshAt <= now, not currently refreshing)
    // Rows are sorted to prioritize report IDs, then by most recent period, then by nextRefreshAt
    const dueRecords = await db
        .select()
        .from(reportDatasetMetadata)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.countryCode, countryCode),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType),
                or(and(lte(reportDatasetMetadata.nextRefreshAt, now), eq(reportDatasetMetadata.refreshing, false)), isNotNull(reportDatasetMetadata.reportId))
            )
        )
        .orderBy(desc(reportDatasetMetadata.reportId), desc(reportDatasetMetadata.periodStart), reportDatasetMetadata.nextRefreshAt)
        .limit(adjustedLimit);

    logger.info(
        {
            aggregation,
            entityType,
            dueRecordsCount: dueRecords.length,
            dueRecords: dueRecords.map(r => ({
                uid: r.uid,
                periodStart: r.periodStart.toISOString(),
                nextRefreshAt: r.nextRefreshAt?.toISOString() ?? null,
                reportId: r.reportId,
                refreshing: r.refreshing,
                status: r.status,
            })),
        },
        'Fetched due records for enqueue'
    );

    if (dueRecords.length === 0) {
        logger.info({ aggregation, entityType }, 'No records due for refresh');
        return;
    }

    // For each record, first mark it as refreshing.
    // Use UIDs to ensure we only update the specific due records
    await db
        .update(reportDatasetMetadata)
        .set({ refreshing: true })
        .where(
            inArray(
                reportDatasetMetadata.uid,
                dueRecords.map(record => record.uid)
            )
        );

    logger.info({ aggregation, entityType, count: dueRecords.length }, 'Marked records as refreshing');

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
        logger.debug(
            {
                jobId,
                periodStart: record.periodStart.toISOString(),
                aggregation: record.aggregation,
            },
            'Enqueued update-report-status job'
        );
        return jobId;
    });

    const jobIds = await Promise.all(statusJobPromises);

    logger.info(
        {
            aggregation,
            entityType,
            enqueuedCount: jobIds.length,
            jobIds,
        },
        'Finished enqueueing update-report-status jobs'
    );
}
