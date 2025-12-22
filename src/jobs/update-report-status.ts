/**
 * Job: Update report status for a specific report dataset.
 * Handles the async processing of report status updates including state machine logic,
 * report creation, parsing, and status updates.
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { reportDatasetMetadata } from '@/db/schema.js';
import { createReportForDataset } from '@/lib/create-report/index.js';
import { parseReport } from '@/lib/parse-report/index';
import { getNextAction } from '@/lib/report-status-state-machine';
import { getNextRefreshTime } from '@/lib/report-status-state-machine/eligibility';
import type { AggregationType, EntityType } from '@/types/reports.js';
import { AGGREGATION_TYPES, ENTITY_TYPES } from '@/types/reports.js';
import { emitReportDatasetMetadataError } from '@/utils/emit-report-dataset-metadata-error.js';
import { emitReportDatasetMetadataUpdated } from '@/utils/emit-report-dataset-metadata-updated.js';
import { createJobLogger } from '@/utils/logger';
import { boss } from './boss.js';

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
    timestamp: z.string(),
    aggregation: z.enum(AGGREGATION_TYPES),
    entityType: z.enum(ENTITY_TYPES),
});

export const updateReportStatusJob = boss
    .createJob('update-report-status')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const job of jobs) {
            const { accountId, countryCode, timestamp, aggregation, entityType } = job.data;
            const date = new Date(timestamp);

            // Create job-specific logger with context
            const logger = createJobLogger('update-report-status', job.id, {
                accountId,
                countryCode,
                aggregation,
                entityType,
                timestamp,
            });

            let action: string | undefined;
            let reportDatum: typeof reportDatasetMetadata.$inferSelect | null | undefined = null;
            try {
                // Fetch current row once at the start
                reportDatum = await db.query.reportDatasetMetadata.findFirst({
                    where: and(
                        eq(reportDatasetMetadata.accountId, accountId),
                        eq(reportDatasetMetadata.periodStart, date),
                        eq(reportDatasetMetadata.aggregation, aggregation),
                        eq(reportDatasetMetadata.entityType, entityType)
                    ),
                });

                if (!reportDatum) {
                    return;
                }

                // Mark as refreshing immediately so UI updates ASAP
                await startRefreshing(accountId, date, aggregation, entityType);

                // TODO: Remove this artificial delay after testing
                await new Promise(resolve => setTimeout(resolve, 5000));

                // Calculate nextRefreshAt once for the entire job
                const nextRefreshAt = getNextRefreshTime({
                    periodStart: reportDatum.periodStart,
                    aggregation: reportDatum.aggregation as 'hourly' | 'daily',
                    lastReportCreatedAt: reportDatum.lastReportCreatedAt,
                    reportId: reportDatum.reportId,
                    countryCode: reportDatum.countryCode,
                });

                // Determine next action using state machine
                // The state machine will fetch report status if reportId exists
                action = await getNextAction(
                    reportDatum.periodStart,
                    reportDatum.aggregation as 'hourly' | 'daily',
                    reportDatum.entityType as 'target' | 'product',
                    reportDatum.lastReportCreatedAt,
                    reportDatum.reportId,
                    countryCode
                );

                switch (action) {
                    case 'none': {
                        // If report is pending, poll again in 5 minutes; otherwise use calculated refresh time
                        const refreshAt = reportDatum.reportId ? new Date(Date.now() + 5 * 60 * 1000) : nextRefreshAt;
                        await completeJob(accountId, date, aggregation, entityType, refreshAt);
                        return;
                    }

                    case 'process':
                        // Set status to 'parsing' at the start of parsing
                        await updateStatus('parsing', null, accountId, date, aggregation, entityType);
                        await parseReport({ accountId, timestamp, aggregation, entityType });

                        // Mark report as processed: clear reportId, set lastProcessedReportId
                        await markReportProcessed(accountId, date, aggregation, entityType, reportDatum.reportId);
                        await completeJob(accountId, date, aggregation, entityType, nextRefreshAt);
                        return;

                    case 'create':
                        await createReportForDataset({ accountId, countryCode, timestamp, aggregation, entityType });
                        await completeJob(accountId, date, aggregation, entityType, nextRefreshAt);
                        return;

                    default:
                        logger.error({ action }, 'Unknown action received');
                        await completeJob(accountId, date, aggregation, entityType, nextRefreshAt);
                        return;
                }
            } catch (error) {
                await handleJobError({
                    error,
                    reportDatum,
                    action: action || 'unknown',
                    logger,
                });
            }
        }
    });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sets refreshing=true and emits the update event.
 */
async function startRefreshing(accountId: string, periodStart: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ refreshing: true })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.periodStart, periodStart),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitReportDatasetMetadataUpdated(updatedRow);
    }
}

/**
 * Completes the job: sets refreshing=false and nextRefreshAt.
 * This is the job's responsibility - helpers should not set these fields.
 */
async function completeJob(accountId: string, periodStart: Date, aggregation: AggregationType, entityType: EntityType, nextRefreshAt: Date | null): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ refreshing: false, nextRefreshAt })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.periodStart, periodStart),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitReportDatasetMetadataUpdated(updatedRow);
    }
}

/**
 * Updates the status for a report datum and emits the update event
 */
async function updateStatus(status: string, error: string | null, accountId: string, periodStart: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ status, error })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.periodStart, periodStart),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitReportDatasetMetadataUpdated(updatedRow);
    }
}

/**
 * Marks a report as processed: clears reportId, sets lastProcessedReportId
 */
async function markReportProcessed(accountId: string, periodStart: Date, aggregation: AggregationType, entityType: EntityType, reportId: string | null): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({
            status: 'completed',
            reportId: null,
            lastProcessedReportId: reportId,
            error: null,
        })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.periodStart, periodStart),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitReportDatasetMetadataUpdated(updatedRow);
    }
}

/**
 * Sets error state: status='error', error message
 */
async function setErrorState(accountId: string, periodStart: Date, aggregation: AggregationType, entityType: EntityType, errorMessage: string): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({
            status: 'error',
            error: errorMessage,
        })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.periodStart, periodStart),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitReportDatasetMetadataUpdated(updatedRow);
    }
}

/**
 * Handles errors during report status update job execution.
 * Builds detailed error message, logs error, sets error state, schedules retry, and emits error event.
 */
async function handleJobError(args: {
    error: unknown;
    reportDatum: typeof reportDatasetMetadata.$inferSelect | null | undefined;
    action: string;
    logger: ReturnType<typeof createJobLogger>;
}): Promise<void> {
    const { error, reportDatum, action, logger } = args;

    if (!reportDatum) {
        logger.error({ err: error }, 'Error occurred but reportDatum is not available');
        return;
    }

    const { accountId, countryCode, aggregation, entityType, periodStart } = reportDatum;
    const timestamp = periodStart.toISOString();

    // Build detailed error message with context
    let errorMessage: string;
    if (error instanceof Error) {
        errorMessage = `Error during ${action} for ${aggregation} ${entityType} report (account: ${accountId}, period: ${timestamp}): ${error.message}`;

        // Include cause if available
        if ((error as Error & { cause?: Error }).cause) {
            errorMessage += `\nCause: ${(error as Error & { cause?: Error }).cause?.message}`;
        }
    } else {
        errorMessage = `Unknown error during report status update for ${aggregation} ${entityType} report (account: ${accountId}, period: ${timestamp})`;
    }

    logger.error({ err: error, accountId, countryCode, aggregation, entityType, timestamp, action }, 'Error during updating report status.');

    // Retry in 5 minutes - throttling system will handle rate limiting
    const retryTime = new Date(Date.now() + 5 * 60 * 1000);

    // Set error state, then complete job with retry time
    await setErrorState(accountId, periodStart, aggregation as AggregationType, entityType as EntityType, errorMessage);
    await completeJob(accountId, periodStart, aggregation as AggregationType, entityType as EntityType, retryTime);

    // Emit error event
    emitReportDatasetMetadataError({
        accountId,
        countryCode,
        periodStart,
        aggregation: aggregation as 'hourly' | 'daily',
        entityType: entityType as 'target' | 'product',
        error: errorMessage,
    });
}
