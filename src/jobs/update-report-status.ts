/**
 * Job: Update report status for a specific report dataset.
 * Handles the async processing of report status updates including state machine logic,
 * report creation, parsing, and status updates.
 */

import { and, eq, type InferSelectModel } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { reportDatasetMetadata } from '@/db/schema.js';
import { createReportForDataset } from '@/lib/create-report/index.js';
import { parseReport } from '@/lib/parse-report/index';
import { getNextAction } from '@/lib/report-status-state-machine';
import { getNextRefreshTime } from '@/lib/report-status-state-machine/eligibility';
import { AGGREGATION_TYPES, ENTITY_TYPES } from '@/types/reports.js';
import { emitEvent } from '@/utils/events.js';
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

                if (!reportDatum) {
                    return;
                }

                // Mark as refreshing immediately so UI updates ASAP
                await setRefreshing(reportDatum, true);

                // TODO: Remove this artificial delay after testing
                await new Promise(resolve => setTimeout(resolve, 5000));

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
                        await setRefreshing(reportDatum, true);
                        return;
                    }

                    case 'process':
                        // Set status to 'parsing' at the start of parsing
                        await setStatus(reportDatum, 'parsing');
                        await parseReport({ accountId, timestamp, aggregation, entityType });

                        // Mark report as processed: clear reportId, set lastProcessedReportId
                        await markReportProcessed(reportDatum, reportDatum.reportId);
                        await setNextRefreshAt(reportDatum, getNextRefreshTime(reportDatum));
                        await setRefreshing(reportDatum, false);
                        return;

                    case 'create':
                        await createReportForDataset({ accountId, countryCode, timestamp, aggregation, entityType });
                        await setNextRefreshAt(reportDatum, getNextRefreshTime(reportDatum));
                        await setRefreshing(reportDatum, false);
                        return;

                    default:
                        throw new Error(`Unknown action received from state machine: ${action}`);
                }
            } catch (error) {
                logger.error({ err: error }, 'Error encountered while updating state machine for report datum.');
                if (reportDatum) {
                    await setNextRefreshAt(reportDatum, new Date(Date.now() + 5 * 60 * 1000));
                    await setError(reportDatum, error);
                }
            }
        }
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
 */
async function markReportProcessed(row: InferSelectModel<typeof reportDatasetMetadata>, reportId: string | null): Promise<void> {
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

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
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
