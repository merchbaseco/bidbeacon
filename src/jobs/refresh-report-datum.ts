/**
 * Job: Refresh report datum for a specific report dataset.
 * Handles the async processing of report refresh including state machine logic,
 * report creation, parsing, and status updates.
 */

import { and, eq } from 'drizzle-orm';
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

            try {
                // Set refreshing=true in database and get the report datum
                const reportDatum = await setRefreshing(true, accountId, date, aggregation, entityType, null);

                if (!reportDatum) {
                    return;
                }

                // Determine next action using state machine
                // The state machine will fetch report status if reportId exists
                const action = await getNextAction(reportDatum.timestamp, reportDatum.aggregation as 'hourly' | 'daily', reportDatum.lastReportCreatedAt, reportDatum.reportId, countryCode);

                switch (action) {
                    case 'none':
                        await setRefreshing(false, accountId, date, aggregation, entityType, null);
                        return;

                    case 'process':
                        // Set status to 'parsing' at the start of parsing
                        await updateStatus('parsing', null, accountId, date, aggregation, entityType);
                        await parseReport({ accountId, timestamp, aggregation, entityType });

                        // Update status to 'completed' after successful parsing
                        await updateStatus('completed', null, accountId, date, aggregation, entityType);
                        await setRefreshing(false, accountId, date, aggregation, entityType, null);
                        return;

                    case 'create': {
                        const _reportId = await createReportForDataset({ accountId, countryCode, timestamp, aggregation, entityType });
                        await setRefreshing(false, accountId, date, aggregation, entityType, null);
                        return;
                    }

                    default:
                        // Set refreshing=false in database for unknown action
                        logger.error({ action }, 'Unknown action received');
                        await setRefreshing(false, accountId, date, aggregation, entityType, `Unknown next state machine action: ${action}`);
                        return;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';

                logger.error(
                    {
                        err: error,
                    },
                    'Error during refreshing report datum state.'
                );

                // Set status to 'error' whenever an error occurs
                await updateStatus('error', errorMessage, accountId, date, aggregation, entityType);
                await setRefreshing(false, accountId, date, aggregation, entityType, errorMessage);
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
