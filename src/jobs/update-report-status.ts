/**
 * Job: Update report status for a specific report dataset.
 * Handles the async processing of report status updates including state machine logic,
 * report creation, parsing, and status updates.
 */

import { toZonedTime } from 'date-fns-tz';
import { and, eq, type InferSelectModel } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { reportDatasetMetadata } from '@/db/schema';
import { createReportForDataset } from '@/lib/create-report/index';
import { parseReport } from '@/lib/parse-report/index';
import { getNextAction } from '@/lib/report-status-state-machine';
import { getNextRefreshTime } from '@/lib/report-status-state-machine/eligibility';
import { AGGREGATION_TYPES, ENTITY_TYPES } from '@/types/reports';
import { utcNow } from '@/utils/date';
import { emitEvent } from '@/utils/events';
import { withJobSession } from '@/utils/job-sessions';
import { getTimezoneForCountry } from '@/utils/timezones';
import { boss } from './boss';

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
    .options({
        batchSize: 5, // Fetch and process 5 jobs per handler invocation
    })
    .work(async jobs => {
        // Process all jobs in the batch concurrently
        // Note: With batchSize: 1 (default), this will be a single job, but we handle batches
        // in case batchSize is increased in the future
        await Promise.all(
            jobs.map(job => {
                const { accountId, countryCode, timestamp, aggregation, entityType } = job.data;
                const date = new Date(timestamp);

                return withJobSession(
                    {
                        jobName: 'update-report-status',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async recorder => {
                        let action: string | undefined;
                        let reportDatum: InferSelectModel<typeof reportDatasetMetadata> | undefined;
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

                    if (!reportDatum || reportDatum.refreshing) {
                        return;
                    }

                    // Mark as refreshing immediately so UI updates ASAP
                    await setRefreshing(reportDatum, true);

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
                                await setNextRefreshAt(reportDatum, getNextRefreshTime(reportDatum));
                                await setRefreshing(reportDatum, false);
                                await recorder.addAction({
                                    type: 'report-status-checked',
                                    accountId,
                                    countryCode,
                                    aggregation,
                                    entityType,
                                    timestamp,
                                });
                                break;
                            }

                            case 'create': {
                                const reportId = await createReportForDataset({ accountId, countryCode, timestamp, aggregation, entityType });
                                const updatedRow = await setReport(reportDatum, reportId);
                                await setNextRefreshAt(updatedRow, getNextRefreshTime(updatedRow));
                                await setStatus(updatedRow, 'fetching');
                                await setRefreshing(updatedRow, false);
                                await recorder.addAction({
                                    type: 'report-status-queued',
                                    accountId,
                                    countryCode,
                                    aggregation,
                                    entityType,
                                    timestamp,
                                    reportId,
                                });
                                break;
                            }

                            case 'process': {
                                // Set status to 'parsing' at the start of parsing
                                await setStatus(reportDatum, 'parsing');
                                await parseReport(reportDatum.uid);

                                // Mark report as processed: clear reportId, set lastProcessedReportId
                                const processedRow = await markReportProcessed(reportDatum, reportDatum.reportId);
                                await setNextRefreshAt(processedRow, getNextRefreshTime(processedRow));
                                await setRefreshing(processedRow, false);
                                await recorder.addAction({
                                    type: 'report-status-processed',
                                    accountId,
                                    countryCode,
                                    aggregation,
                                    entityType,
                                    timestamp,
                                    reportId: reportDatum.reportId ?? null,
                                });
                                break;
                            }

                            default:
                                throw new Error(`Unknown action received from state machine: ${action}`);
                        }

                        if (reportDatum.error) {
                            await clearError(reportDatum);
                        }
                        } catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            recorder.markFailure(message);
                            if (reportDatum) {
                                await setNextRefreshAt(reportDatum, new Date(Date.now() + 5 * 60 * 1000));
                                await setError(reportDatum, error);
                            }
                        }
                    }
                );
            })
        );
    });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sets refreshing=true/false and emits update event.
 */
async function setRefreshing(row: InferSelectModel<typeof reportDatasetMetadata>, refreshing: boolean): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ refreshing })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}

/**
 * Updates the status for a report datum and emits update event.
 */
async function setStatus(row: InferSelectModel<typeof reportDatasetMetadata>, status: string): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ status })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}

/**
 * Marks a report as processed: clears reportId, sets lastProcessedReportId, and emits update event.
 * Returns the updated row.
 */
async function markReportProcessed(row: InferSelectModel<typeof reportDatasetMetadata>, reportId: string | null): Promise<InferSelectModel<typeof reportDatasetMetadata>> {
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
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (!updatedRow) {
        throw new Error(`Failed to mark report as processed for ${row.accountId}`);
    }

    emitEvent({
        type: 'report:refreshed',
        row: updatedRow,
    });

    return updatedRow;
}

async function setNextRefreshAt(row: InferSelectModel<typeof reportDatasetMetadata>, nextRefreshAt: Date | null): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ nextRefreshAt })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}

/**
 * Sets the reportId and lastReportCreatedAt after a report is created via the Amazon Ads API.
 * Returns the updated row.
 */
async function setReport(row: InferSelectModel<typeof reportDatasetMetadata>, reportId: string): Promise<InferSelectModel<typeof reportDatasetMetadata>> {
    // Convert current UTC time to country's timezone and store as timezone-less timestamp
    const timezone = getTimezoneForCountry(row.countryCode);
    const nowUtc = utcNow();
    const zonedTime = toZonedTime(nowUtc, timezone);
    const lastReportCreatedAt = new Date(zonedTime.getFullYear(), zonedTime.getMonth(), zonedTime.getDate(), zonedTime.getHours(), zonedTime.getMinutes(), zonedTime.getSeconds());

    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({
            reportId,
            lastReportCreatedAt,
        })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (!updatedRow) {
        throw new Error(`Failed to update metadata for report ${reportId}`);
    }

    emitEvent({
        type: 'report:refreshed',
        row: updatedRow,
    });

    return updatedRow;
}

/**
 * Handles errors during report status update job execution.
 * Builds detailed error message, logs error, sets error state, schedules retry, and emits events.
 */
async function setError(reportDatum: typeof reportDatasetMetadata.$inferSelect, error: unknown): Promise<void> {
    // Build error message and stack trace for logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error && error.stack ? error.stack : undefined;
    const fullError = errorStack ? `${errorMessage}\n${JSON.stringify(errorStack)}` : errorMessage;

    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ status: 'error', error: fullError, refreshing: false })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, reportDatum.accountId),
                eq(reportDatasetMetadata.periodStart, reportDatum.periodStart),
                eq(reportDatasetMetadata.aggregation, reportDatum.aggregation),
                eq(reportDatasetMetadata.entityType, reportDatum.entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}

async function clearError(row: InferSelectModel<typeof reportDatasetMetadata>): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ error: null })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        );

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}
