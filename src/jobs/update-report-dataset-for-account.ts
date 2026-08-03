import { and, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { reportDatasetMetadata } from '@/db/schema';
import { gateAccountWork } from '@/jobs/account-access-gate';
import { boss } from '@/jobs/boss';
import { getHourlyReportRetentionWindow } from '@/lib/report-retention';
import { getNextRefreshTime } from '@/lib/report-status-state-machine/eligibility';
import type { AggregationType, EntityType } from '@/types/reports';
import { zonedNow, zonedStartOfDay, zonedSubtractDays, zonedSubtractMonths } from '@/utils/date';
import { emitEvent } from '@/utils/events';
import { withJobMetrics } from '@/utils/job-metrics';
import { getTimezoneForCountry } from '@/utils/timezones';

// Amazon Ads API data retention periods
const DAILY_RETENTION_MONTHS = 15;

// ============================================================================
// Job Definition
//
// This job backfills any missing rows into the report_dataset_metadata table
// for a given account and country code. Due work is dispatched separately by
// dispatch-due-reports, which can run every minute without repeating maintenance.
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
                withJobMetrics(
                    {
                        jobName: 'update-report-dataset-for-account',
                        bossJobId: job.id,
                        input: job.data,
                        accountId: job.data.accountId,
                        countryCode: job.data.countryCode,
                    },
                    async recorder => {
                        const { accountId, countryCode } = job.data;
                        if (!(await gateAccountWork({ accountId, countryCode, recorder }))) {
                            return;
                        }

                        const timezone = getTimezoneForCountry(countryCode);
                        const now = zonedNow(timezone);

                        const dailyCleanup = await cleanupOutOfBoundsMetadataRecords(accountId, countryCode, now, 'daily', 'target', timezone);
                        const hourlyCleanup = await cleanupOutOfBoundsMetadataRecords(accountId, countryCode, now, 'hourly', 'target', timezone);

                        const dailyInsert = await insertMissingMetadataRecords(accountId, countryCode, now, 'daily', 'target', timezone);
                        const hourlyInsert = await insertMissingMetadataRecords(accountId, countryCode, now, 'hourly', 'target', timezone);

                        emitEvent({
                            type: 'reports:refreshed',
                            accountId,
                        });

                        recorder.addEvent({
                            message: null,
                            payload: {
                                accountId,
                                countryCode,
                                cleanup: {
                                    daily: {
                                        deletedCount: dailyCleanup.deletedCount,
                                        cutoff: dailyCleanup.cutoff.toISOString(),
                                    },
                                    hourly: {
                                        deletedCount: hourlyCleanup.deletedCount,
                                        cutoff: hourlyCleanup.cutoff.toISOString(),
                                    },
                                },
                                backfill: {
                                    daily: {
                                        insertedCount: dailyInsert.insertedCount,
                                        totalPeriods: dailyInsert.totalPeriods,
                                        windowStart: dailyInsert.earliestPeriodStart.toISOString(),
                                        windowEnd: dailyInsert.latestPeriodStart.toISOString(),
                                    },
                                    hourly: {
                                        insertedCount: hourlyInsert.insertedCount,
                                        totalPeriods: hourlyInsert.totalPeriods,
                                        windowStart: hourlyInsert.earliestPeriodStart.toISOString(),
                                        windowEnd: hourlyInsert.latestPeriodStart.toISOString(),
                                    },
                                },
                            },
                        });
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
    const hourlyRetentionWindow = getHourlyReportRetentionWindow(now, timezone);
    const currentPeriodStart = isHourly ? hourlyRetentionWindow.latestPeriodStart : zonedStartOfDay(now, timezone);
    const earliestPeriodStart = isHourly ? hourlyRetentionWindow.earliestPeriodStart : zonedSubtractMonths(currentPeriodStart, DAILY_RETENTION_MONTHS, timezone);
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
        periodStart = zonedSubtractDays(periodStart, 1, timezone);
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
    const currentPeriodStart = zonedStartOfDay(now, timezone);
    const cutoff = isHourly ? getHourlyReportRetentionWindow(now, timezone).earliestPeriodStart : zonedSubtractMonths(currentPeriodStart, DAILY_RETENTION_MONTHS, timezone);

    const deletedRows = await db
        .delete(reportDatasetMetadata)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.countryCode, countryCode),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType),
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
