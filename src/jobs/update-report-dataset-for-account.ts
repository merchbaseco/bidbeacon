import { and, desc, eq, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { reportDatasetMetadata } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { getNextRefreshTime } from '@/lib/report-status-state-machine/eligibility';
import type { AggregationType, EntityType } from '@/types/reports';
import { zonedNow, zonedStartOfDay, zonedSubtractDays, zonedSubtractHours, zonedSubtractMonths, zonedTopOfHour } from '@/utils/date';
import { emitEvent } from '@/utils/events';
import { getTimezoneForCountry } from '@/utils/timezones';
import { updateReportStatusJob } from './update-report-status';
import { withJobSession } from '@/utils/job-sessions';

// Amazon Ads API data retention periods
const HOURLY_RETENTION_DAYS = 14;
const DAILY_RETENTION_MONTHS = 15;

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
        await Promise.all(
            jobs.map(job =>
                withJobSession(
                    {
                        jobName: 'update-report-dataset-for-account',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async recorder => {
                        const { accountId, countryCode } = job.data;

                        const timezone = getTimezoneForCountry(countryCode);
                        const now = zonedNow(timezone);

                        const dailyCleanup = await cleanupOutOfBoundsMetadataRecords(accountId, countryCode, now, 'daily', 'target', timezone);
                        const hourlyCleanup = await cleanupOutOfBoundsMetadataRecords(accountId, countryCode, now, 'hourly', 'target', timezone);

                        await recorder.addAction({
                            type: 'report-dataset-cleanup',
                            accountId,
                            countryCode,
                            aggregation: 'daily',
                            entityType: 'target',
                            cutoff: dailyCleanup.cutoff.toISOString(),
                            deletedCount: dailyCleanup.deletedCount,
                        });

                        await recorder.addAction({
                            type: 'report-dataset-cleanup',
                            accountId,
                            countryCode,
                            aggregation: 'hourly',
                            entityType: 'target',
                            cutoff: hourlyCleanup.cutoff.toISOString(),
                            deletedCount: hourlyCleanup.deletedCount,
                        });

                        const dailyInsert = await insertMissingMetadataRecords(accountId, countryCode, now, 'daily', 'target', timezone);
                        const hourlyInsert = await insertMissingMetadataRecords(accountId, countryCode, now, 'hourly', 'target', timezone);

                        await recorder.addAction({
                            type: 'report-dataset-backfill',
                            accountId,
                            countryCode,
                            aggregation: 'daily',
                            entityType: 'target',
                            insertedCount: dailyInsert.insertedCount,
                            totalPeriods: dailyInsert.totalPeriods,
                            windowStart: dailyInsert.earliestPeriodStart.toISOString(),
                            windowEnd: dailyInsert.latestPeriodStart.toISOString(),
                        });

                        await recorder.addAction({
                            type: 'report-dataset-backfill',
                            accountId,
                            countryCode,
                            aggregation: 'hourly',
                            entityType: 'target',
                            insertedCount: hourlyInsert.insertedCount,
                            totalPeriods: hourlyInsert.totalPeriods,
                            windowStart: hourlyInsert.earliestPeriodStart.toISOString(),
                            windowEnd: hourlyInsert.latestPeriodStart.toISOString(),
                        });

                        const dailyResult = await enqueueUpdateReportStatusJobs(accountId, countryCode, now, 'daily', 'target');
                        const hourlyResult = await enqueueUpdateReportStatusJobs(accountId, countryCode, now, 'hourly', 'target');
                        const totalDatasets = dailyResult.count + hourlyResult.count;
                        const enqueuedActions = [...dailyResult.actions, ...hourlyResult.actions];

                        emitEvent({
                            type: 'reports:refreshed',
                            accountId,
                        });

                        await recorder.addAction({
                            type: 'report-dataset-scan',
                            accountId,
                            countryCode,
                            dailyEnqueuedCount: dailyResult.count,
                            hourlyEnqueuedCount: hourlyResult.count,
                            totalEnqueuedCount: totalDatasets,
                        });

                        await Promise.all(enqueuedActions.map(action => recorder.addAction(action)));
                    }
                )
            )
        );
    });

// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Insert missing metadata records within the retention period.
 * Creates missing rows starting from the most recent period and working backwards
 * until the retention limit is reached. Existing records are ignored via onConflictDoNothing.
 */
async function insertMissingMetadataRecords(
    accountId: string,
    countryCode: string,
    now: Date,
    aggregation: AggregationType,
    entityType: EntityType,
    timezone: string
): Promise<{ insertedCount: number; totalPeriods: number; earliestPeriodStart: Date; latestPeriodStart: Date }> {
    const isHourly = aggregation === 'hourly';
    const currentPeriodStart = isHourly ? zonedTopOfHour(now, timezone) : zonedStartOfDay(now, timezone);
    const earliestPeriodStart = isHourly
        ? zonedSubtractHours(currentPeriodStart, HOURLY_RETENTION_DAYS * 24, timezone)
        : zonedSubtractMonths(currentPeriodStart, DAILY_RETENTION_MONTHS, timezone);
    let insertedCount = 0;
    let totalPeriods = 0;

    // Start from the most recent period and work backwards
    let periodStart = currentPeriodStart;
    const earliestTime = earliestPeriodStart.getTime();
    while (periodStart.getTime() >= earliestTime) {
        totalPeriods += 1;
        // Insert metadata row for this time period (ignores if already exists)
        const inserted = await insertMetadata({
            accountId,
            countryCode,
            periodStart,
            aggregation,
            entityType,
            status: 'missing',
            error: null,
        });
        if (inserted) {
            insertedCount += 1;
        }

        // Move to the previous period
        periodStart = isHourly ? zonedSubtractHours(periodStart, 1, timezone) : zonedSubtractDays(periodStart, 1, timezone);
    }

    return {
        insertedCount,
        totalPeriods,
        earliestPeriodStart,
        latestPeriodStart: currentPeriodStart,
    };
}

async function cleanupOutOfBoundsMetadataRecords(
    accountId: string,
    countryCode: string,
    now: Date,
    aggregation: AggregationType,
    entityType: EntityType,
    timezone: string
): Promise<{ deletedCount: number; cutoff: Date }> {
    const isHourly = aggregation === 'hourly';
    const currentPeriodStart = isHourly ? zonedTopOfHour(now, timezone) : zonedStartOfDay(now, timezone);
    const cutoff = isHourly
        ? zonedSubtractHours(currentPeriodStart, HOURLY_RETENTION_DAYS * 24, timezone)
        : zonedSubtractMonths(currentPeriodStart, DAILY_RETENTION_MONTHS, timezone);

    const deletedRows = await db
        .delete(reportDatasetMetadata)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.countryCode, countryCode),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType),
                sql`${reportDatasetMetadata.status} <> 'completed'`,
                lt(reportDatasetMetadata.periodStart, cutoff)
            )
        )
        .returning({ uid: reportDatasetMetadata.uid });

    return {
        deletedCount: deletedRows.length,
        cutoff,
    };
}

async function insertMetadata(args: {
    accountId: string;
    countryCode: string;
    periodStart: Date;
    aggregation: AggregationType;
    entityType: EntityType;
    status: 'missing' | 'fetching' | 'parsing' | 'completed' | 'error';
    error?: string | null;
}): Promise<boolean> {
    const { accountId, countryCode, periodStart, aggregation, entityType, status, error } = args;

    const inserted = await db
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
        })
        .returning({ uid: reportDatasetMetadata.uid });

    return inserted.length > 0;
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
async function enqueueUpdateReportStatusJobs(accountId: string, countryCode: string, now: Date, aggregation: AggregationType, entityType: EntityType): Promise<{
    count: number;
    actions: Array<{
        type: string;
        jobName: string;
        bossJobId: string;
        input: Record<string, string>;
    }>;
}> {
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
        return { count: 0, actions: [] };
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

    const actions = recordsNeedingWork.flatMap((record, index) => {
        const bossJobId = jobIds[index];
        if (!bossJobId) {
            return [];
        }
        return [
            {
                type: 'enqueue-report-status',
                jobName: 'update-report-status',
                bossJobId,
                input: {
                    accountId: record.accountId,
                    countryCode: record.countryCode,
                    timestamp: record.periodStart.toISOString(),
                    aggregation: record.aggregation,
                    entityType: record.entityType,
                },
            },
        ];
    });

    return {
        count: actions.length,
        actions,
    };
}
