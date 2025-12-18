/**
 * Job: Refresh report datum for a specific report dataset.
 * Handles the async processing of report refresh including state machine logic,
 * report creation, parsing, and status updates.
 */

import { and, eq } from 'drizzle-orm';
import type pino from 'pino';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { reportDatasetMetadata } from '@/db/schema.js';
import { createReportForDataset } from '@/lib/create-report/index.js';
import { parseReport } from '@/lib/parse-report/index';
import { getNextAction } from '@/lib/report-datum-state-machine';
import type { AggregationType, EntityType } from '@/types/reports.js';
import { AGGREGATION_TYPES, ENTITY_TYPES } from '@/types/reports.js';
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

export const refreshReportDatumJob = boss
    .createJob('refresh-report-datum')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const job of jobs) {
            const { accountId, countryCode, timestamp, aggregation, entityType } = job.data;
            const date = new Date(timestamp);

            // Create job-specific logger with context
            const logger = createJobLogger('refresh-report-datum', job.id, {
                accountId,
                countryCode,
                aggregation,
                entityType,
                timestamp,
            });

            logger.info('Starting job');

            try {
                // Set refreshing=true in database and get the report datum
                const reportDatum = await setRefreshing(true, accountId, date, aggregation, entityType, null);

                if (!reportDatum) {
                    logger.warn('Report datum not found - clearing refreshing state');
                    await setRefreshing(false, accountId, date, aggregation, entityType, 'Report datum not found');
                    return;
                }

                // Determine next action using state machine
                // The state machine will fetch report status if reportId exists
                logger.info(
                    {
                        timestamp: reportDatum.timestamp.toISOString(),
                        aggregation: reportDatum.aggregation,
                        lastReportCreatedAt: reportDatum.lastReportCreatedAt?.toISOString() ?? null,
                        reportId: reportDatum.reportId,
                        countryCode,
                    },
                    'State machine inputs'
                );

                const action = await getNextAction(reportDatum.timestamp, reportDatum.aggregation as 'hourly' | 'daily', reportDatum.lastReportCreatedAt, reportDatum.reportId, countryCode);
                logger.info({ action }, 'State machine determined action');

                switch (action) {
                    case 'none':
                        await handleNoneAction(accountId, date, aggregation, entityType);
                        return;

                    case 'process':
                        await handleProcessAction(logger, accountId, timestamp, date, aggregation, entityType);
                        return;

                    case 'create':
                        await handleCreateAction(logger, accountId, countryCode, timestamp, date, aggregation, entityType);
                        return;

                    default:
                        // Set refreshing=false in database for unknown action
                        logger.error({ action }, 'Unknown action received');
                        await setRefreshing(false, accountId, date, aggregation, entityType, `Unknown action: ${action}`);
                        return;
                }
            } catch (error) {
                logger.error(
                    {
                        err: error,
                        errorMessage: error instanceof Error ? error.message : 'Unknown error',
                        errorStack: error instanceof Error ? error.stack : undefined,
                    },
                    'Error during refresh processing'
                );
                // Set refreshing=false in database on error
                try {
                    await setRefreshing(false, accountId, date, aggregation, entityType, error instanceof Error ? error.message : 'Unknown error');
                } catch (updateError) {
                    logger.error(
                        {
                            err: updateError,
                            originalError: error instanceof Error ? error.message : 'Unknown error',
                        },
                        'Failed to update refreshing state on error'
                    );
                }
            }
        }
    });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sets the refreshing state for a report datum and emits the update event.
 * Returns the updated report datum row, or null if it doesn't exist.
 */
async function setRefreshing(
    refreshing: boolean,
    accountId: string,
    timestamp: Date,
    aggregation: AggregationType,
    entityType: EntityType,
    error?: string | null
): Promise<typeof reportDatasetMetadata.$inferSelect | null> {
    const updateData: { refreshing: boolean; error?: string | null } = { refreshing };
    if (error !== undefined) {
        updateData.error = error;
    }

    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set(updateData)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.timestamp, timestamp),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitReportDatasetMetadataUpdated(updatedRow);
        return updatedRow;
    }

    // If update didn't return a row, check if it exists (maybe it wasn't updated for some reason)
    const existingRow = await db.query.reportDatasetMetadata.findFirst({
        where: and(
            eq(reportDatasetMetadata.accountId, accountId),
            eq(reportDatasetMetadata.timestamp, timestamp),
            eq(reportDatasetMetadata.aggregation, aggregation),
            eq(reportDatasetMetadata.entityType, entityType)
        ),
    });

    return existingRow ?? null;
}

/**
 * Updates the status for a report datum and emits the update event
 */
async function updateStatus(status: string, error: string | null, accountId: string, timestamp: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({
            status,
            error,
        })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.timestamp, timestamp),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitReportDatasetMetadataUpdated(updatedRow);
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Handles the 'none' action - no work needed, just clear refreshing state
 */
async function handleNoneAction(accountId: string, timestamp: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    await setRefreshing(false, accountId, timestamp, aggregation, entityType, null);
}

/**
 * Handles the 'process' action - parses an existing report
 */
async function handleProcessAction(logger: pino.Logger, accountId: string, timestamp: string, date: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    // Set status to 'parsing' at the start of parsing
    await updateStatus('parsing', null, accountId, date, aggregation, entityType);

    try {
        await parseReport({
            accountId,
            timestamp,
            aggregation,
            entityType,
        });

        // Update status to 'completed' after successful parsing
        await updateStatus('completed', null, accountId, date, aggregation, entityType);
    } catch (error) {
        logger.error(
            {
                err: error,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                errorStack: error instanceof Error ? error.stack : undefined,
            },
            'Error parsing report'
        );
        // Update status to 'failed' on error
        await updateStatus('failed', error instanceof Error ? error.message : 'Unknown error', accountId, date, aggregation, entityType);
        throw error;
    }

    await setRefreshing(false, accountId, date, aggregation, entityType, null);
}

/**
 * Handles the 'create' action - creates a new report
 */
async function handleCreateAction(logger: pino.Logger, accountId: string, countryCode: string, timestamp: string, date: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    try {
        const reportId = await createReportForDataset({
            accountId,
            countryCode,
            timestamp,
            aggregation,
            entityType,
        });

        if (!reportId) {
            logger.warn('Failed to create report - no reportId returned');
            await setRefreshing(false, accountId, date, aggregation, entityType, 'Failed to create report');
            return;
        }

        logger.info({ reportId }, 'Report created successfully');
    } catch (error) {
        logger.error(
            {
                err: error,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                errorStack: error instanceof Error ? error.stack : undefined,
            },
            'Error creating report'
        );
        await setRefreshing(false, accountId, date, aggregation, entityType, error instanceof Error ? error.message : 'Unknown error');
        return;
    }

    await setRefreshing(false, accountId, date, aggregation, entityType, null);
}
